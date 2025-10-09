const jobslist = document.getElementById('jobslist');
const searchBar = document.getElementById('searchBar');
const mainCategory = document.getElementById('mainCategory');
let jobData = [];
let displayedJobs = [];
let filteredJobs = [];
const chunkSize = 20; // Number of jobs to load at a time
let currentIndex = 0;

// Event listener for the search bar
searchBar.addEventListener('keyup', (e) => {
    const searchString = e.target.value.toLowerCase();
    const searchWords = searchString.split(' ').filter(word => word.length > 0);
    
    // Debouncing for search to reduce load during typing
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        if (searchWords.length === 0) {
            resetJobs(); // Reset to original job data
            return;
        }
        filteredJobs = filterJobs(searchWords);
        displayedJobs = []; // Clear displayed jobs for new search results
        currentIndex = 0; // Reset index for filtered results
        loadMoreJobs(); // Load the first chunk of filtered jobs
    }, 300);
});

// Function to load jobs data
const loadJobs = async () => {
    try {
        const res = await fetch('jobs.json'); // Adjust the path if necessary
        jobData = await res.json(); // Load all categories and jobs
        loadMoreJobs(); // Load the initial chunk of jobs
    } catch (err) {
        console.error(err);
    }
};

// Function to load more jobs
const loadMoreJobs = () => {
    const jobsToLoad = filteredJobs.length > 0 ? filteredJobs : jobData.flatMap(category => {
        return Object.entries(category.jobs).map(([jobTitle, job]) => ({
            main_category: category.main_category,
            jobTitle,
            job
        }));
    });

    const nextJobs = jobsToLoad.slice(currentIndex, currentIndex + chunkSize);

    if (nextJobs.length === 0) return; // No more jobs to load

    displayedJobs = [...displayedJobs, ...nextJobs];
    currentIndex += chunkSize;

    displayJobs(displayedJobs);
};

// Function to reset jobs when search input is cleared
const resetJobs = () => {
    filteredJobs = [];
    displayedJobs = [];
    currentIndex = 0;
    loadMoreJobs();
};

// Function to filter jobs based on search input
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

// Function to display jobs
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

// Function to generate links HTML
const generateLinksHtml = (links) => {
    return links.map(link => `
        <li class="link">
            <span class="category">${link.category}</span>
            <a href="${link.url}" target="_blank">${link.page_title || link.url}</a>
        </li>
    `).join('');
};

// Function to generate videos HTML with clickable thumbnails
const generateVideosHtml = (videos) => {
    return videos.map(video => {
        const videoId = extractVideoId(video.url);
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        return `
            <div class="video-wrapper" data-video-id="${videoId}" style="margin-bottom: 20px;">
                <img 
                    src="${thumbnailUrl}" 
                    class="video-thumbnail" 
                    style="cursor:pointer; width:100%; max-width:560px;" 
                    alt="Click to play video"
                />
            </div>
        `;
    }).join('');
};

// Floating video management
let currentFloatingVideo = null;
let floatingOriginalParent = null;

// Function to setup clickable thumbnails
const setupVideoThumbnails = () => {
    document.querySelectorAll('.video-wrapper').forEach(wrapper => {
        const thumbnail = wrapper.querySelector('.video-thumbnail');
        const videoId = wrapper.dataset.videoId;

        thumbnail.addEventListener('click', () => {
            // Remove existing floating video if any
            if (currentFloatingVideo) {
                currentFloatingVideo.remove();
                currentFloatingVideo = null;
                floatingOriginalParent = null;
            }

            // Create the iframe for clicked video
            const iframe = document.createElement('iframe');
            iframe.className = 'lazy-yt';
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&autoplay=1`;
            iframe.width = 560;
            iframe.height = 315;
            iframe.frameBorder = 0;
            iframe.allow = "autoplay; encrypted-media; picture-in-picture";
            iframe.allowFullscreen = true;

            // Replace thumbnail with iframe
            wrapper.innerHTML = '';
            wrapper.appendChild(iframe);

            // Mark this video as the one that can float
            currentFloatingVideo = iframe;
            floatingOriginalParent = wrapper;

            // Setup scroll observer to float video if scrolled
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting && currentFloatingVideo === iframe) {
                        // Move to floating bottom-right
                        iframe.style.position = 'fixed';
                        iframe.style.bottom = '20px';
                        iframe.style.right = '20px';
                        iframe.style.width = '320px';
                        iframe.style.height = '180px';
                        document.body.appendChild(iframe);
                    } else if (entry.isIntersecting && currentFloatingVideo === iframe) {
                        // Return to original spot
                        floatingOriginalParent.appendChild(iframe);
                        iframe.style.position = '';
                        iframe.style.bottom = '';
                        iframe.style.right = '';
                        iframe.style.width = '560px';
                        iframe.style.height = '315px';
                    }
                });
            }, { threshold: 0 });

            observer.observe(wrapper);
        });
    });
};

// Function to update the main category display
const updateMainCategory = (jobs) => {
    const firstJob = jobs[0];
    if (firstJob) {
        mainCategory.textContent = firstJob.main_category;
    } else {
        mainCategory.textContent = '';
    }
};

// Function to extract YouTube video ID from URL
const extractVideoId = (url) => {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v') || url.split('/').pop();
};

// Infinite scrolling
window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        loadMoreJobs();
    }
});

// Load jobs data on page ready
document.addEventListener('DOMContentLoaded', loadJobs);
