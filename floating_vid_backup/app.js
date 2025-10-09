const jobslist = document.getElementById('jobslist');
const searchBar = document.getElementById('searchBar');
const mainCategory = document.getElementById('mainCategory');
let jobData = [];
let displayedJobs = [];
let filteredJobs = [];
const chunkSize = 20;
let currentIndex = 0;

// --- Search ---
searchBar.addEventListener('keyup', (e) => {
    const searchString = e.target.value.toLowerCase();
    const searchWords = searchString.split(' ').filter(word => word.length > 0);

    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        if (searchWords.length === 0) {
            resetJobs();
            return;
        }
        filteredJobs = filterJobs(searchWords);
        displayedJobs = [];
        currentIndex = 0;
        loadMoreJobs();
    }, 300);
});

// --- Load jobs ---
const loadJobs = async () => {
    try {
        const res = await fetch('jobs.json');
        jobData = await res.json();
        loadMoreJobs();
    } catch (err) {
        console.error(err);
    }
};

// --- Infinite scroll ---
const loadMoreJobs = () => {
    const jobsToLoad = filteredJobs.length > 0 ? filteredJobs : jobData.flatMap(category => {
        return Object.entries(category.jobs).map(([jobTitle, job]) => ({
            main_category: category.main_category,
            jobTitle,
            job
        }));
    });

    const nextJobs = jobsToLoad.slice(currentIndex, currentIndex + chunkSize);
    if (nextJobs.length === 0) return;

    displayedJobs = [...displayedJobs, ...nextJobs];
    currentIndex += chunkSize;

    displayJobs(displayedJobs);
};

// --- Reset jobs ---
const resetJobs = () => {
    filteredJobs = [];
    displayedJobs = [];
    currentIndex = 0;
    loadMoreJobs();
};

// --- Filter jobs ---
const filterJobs = (searchWords) => {
    return jobData.flatMap(category => {
        return Object.entries(category.jobs)
            .filter(([jobTitle, job]) => {
                const jobTitleMatch = searchWords.some(word => jobTitle.toLowerCase().includes(word));
                const linksMatch = job.links.some(link =>
                    searchWords.some(word =>
                        link.url.toLowerCase().includes(word) ||
                        link.category.toLowerCase().includes(word)
                    )
                );
                return jobTitleMatch || linksMatch;
            })
            .map(([jobTitle, job]) => ({
                main_category: category.main_category,
                jobTitle,
                job
            }));
    });
};

// --- Display jobs ---
const displayJobs = (jobs) => {
    let lastCategory = '';
    const htmlString = jobs.map(({ main_category, jobTitle, job }) => {
        const isNewCategory = main_category !== lastCategory;
        lastCategory = main_category;

        return `
            ${isNewCategory ? `<h2 class="main-category">${main_category}</h2>` : ''}
            <div class="job-section">
                <h3 class="job-title">${jobTitle}</h3>
                <span class="degree-box">Degree Required: ${job.degree_required}</span>
                <ul class="links-list">${generateLinksHtml(job.links)}</ul>
                <div class="videos-container">${generateVideosHtml(job.videos)}</div>
                <div class="jobs-table">${job.jobs_table || ''}</div>
            </div>
        `;
    }).join('');

    jobslist.innerHTML = htmlString;
    updateMainCategory(jobs);
    setupVideoThumbnails();
};

// --- Generate links ---
const generateLinksHtml = (links) => {
    return links.map(link => `
        <li class="link">
            <span class="category">${link.category}</span>
            <a href="${link.url}" target="_blank">${link.page_title || link.url}</a>
        </li>
    `).join('');
};

const generateVideosHtml = (videos) => {
    return videos.map(video => {
        const videoId = extractVideoId(video.url);
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        return `
            <div class="video-wrapper" data-video-id="${videoId}" style="position:relative; width:100%; max-width:560px; height:10; padding-top:1%; margin-bottom:20px;">
                <img
                    src="${thumbnailUrl}"
                    class="video-thumbnail"
                    style="cursor:pointer; position:absolute; top:0; left:0; width:100%; height:100%;"
                    alt="Click to play video"
                />
            </div>
        `;
    }).join('');
};

// --- Floating video management ---
let currentFloatingVideo = null;
let floatingOriginalParent = null;
let originalWidth = 0;
let originalHeight = 0;
let floatingObserver = null;

const setupVideoThumbnails = () => {
    document.querySelectorAll('.video-wrapper').forEach(wrapper => {
        const thumbnail = wrapper.querySelector('.video-thumbnail');
        const videoId = wrapper.dataset.videoId;

        thumbnail.addEventListener('click', () => {
            // Remove previous floating video
            if (currentFloatingVideo) {
                returnVideoToSpot();
            }

            // Store exact size
            originalWidth = wrapper.offsetWidth;
            originalHeight = wrapper.offsetHeight;

            // Create iframe
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&autoplay=1`;
            iframe.frameBorder = 0;
            iframe.allow = "autoplay; encrypted-media; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.width = originalWidth;
            iframe.height = originalHeight;
            iframe.style.position = '';
            iframe.style.bottom = '';
            iframe.style.right = '';
            iframe.style.zIndex = '';

            // Replace thumbnail with iframe
            wrapper.innerHTML = '';
            wrapper.appendChild(iframe);

            currentFloatingVideo = iframe;
            floatingOriginalParent = wrapper;

            // Intersection observer to float
            floatingObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting && currentFloatingVideo === iframe) {
                        // Float without resizing
                        iframe.style.position = 'fixed';
                        iframe.style.bottom = '20px';
                        iframe.style.right = '20px';
                        iframe.style.width = originalWidth + 'px';
                        iframe.style.height = originalHeight + 'px';
                        iframe.style.zIndex = 9999;
                    } else if (entry.isIntersecting && currentFloatingVideo === iframe) {
                        // Redock
                        iframe.style.position = '';
                        iframe.style.bottom = '';
                        iframe.style.right = '';
                        iframe.style.width = originalWidth + 'px';
                        iframe.style.height = originalHeight + 'px';
                        iframe.style.zIndex = '';
                    }
                });
            }, { threshold: 0 });

            floatingObserver.observe(wrapper);

            // Listen for pause (YouTube API needed)
            // We'll use message event to detect pause
            window.addEventListener('message', handleYouTubeMessage);
        });
    });
};

// Return video to original spot
const returnVideoToSpot = () => {
    if (!currentFloatingVideo || !floatingOriginalParent) return;
    currentFloatingVideo.style.position = '';
    currentFloatingVideo.style.bottom = '';
    currentFloatingVideo.style.right = '';
    currentFloatingVideo.style.width = originalWidth + 'px';
    currentFloatingVideo.style.height = originalHeight + 'px';
    floatingOriginalParent.appendChild(currentFloatingVideo);
    currentFloatingVideo = null;
    floatingOriginalParent = null;
    if (floatingObserver) floatingObserver.disconnect();
    floatingObserver = null;
};

// --- Handle YouTube pause via postMessage ---
const handleYouTubeMessage = (event) => {
    if (!event.data || typeof event.data !== 'string') return;
    if (!currentFloatingVideo) return;
    try {
        const data = JSON.parse(event.data);
        if (data.event === 'infoDelivery' && data.info && data.info.playerState === 2) {
            // Player paused
            returnVideoToSpot();
        }
    } catch(e) { }
};

// --- Main category ---
const updateMainCategory = (jobs) => {
    const firstJob = jobs[0];
    mainCategory.textContent = firstJob ? firstJob.main_category : '';
};

// --- Extract video ID ---
const extractVideoId = (url) => {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v') || url.split('/').pop();
};

// --- Infinite scroll ---
window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        loadMoreJobs();
    }
});

// --- Load jobs on DOM ready ---
document.addEventListener('DOMContentLoaded', loadJobs);
