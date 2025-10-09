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
    }, 300); // Adjust timeout as needed
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
    filteredJobs = []; // Clear the filteredJobs to indicate all jobs should be shown
    displayedJobs = [];
    currentIndex = 0; // Reset index to zero for loading
    loadMoreJobs(); // Load the first chunk again
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



// Function to generate videos HTML with lite embeds
const generateVideosHtml = (videos) => {
    return videos.map(video => {
        const videoId = extractVideoId(video.url);
        return `
            <div class="video-wrapper" data-video-id="${videoId}" style="margin-bottom: 20px;">
                <iframe 
                    class="lazy-yt"
                    width="560" 
                    height="315" 
                    src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&mute=1&rel=0&modestbranding=1"
                    frameborder="0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen
                    loading="lazy">
                </iframe>
            </div>
        `;
    }).join('');
};

// Function to setup inline autoplay when video is in viewport
const setupVideoThumbnails = () => {
    const iframes = document.querySelectorAll('.lazy-yt');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const iframe = entry.target;
            if (entry.isIntersecting) {
                // Play video if it comes into view
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: "command",
                    func: "playVideo"
                }), "*");
            } else {
                // Pause video if it goes out of view
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: "command",
                    func: "pauseVideo"
                }), "*");
            }
        });
    }, { threshold: 0.5 }); // Only when 50% visible

    iframes.forEach(iframe => observer.observe(iframe));
};


// Function to update the main category display
const updateMainCategory = (jobs) => {
    const firstJob = jobs[0];
    if (firstJob) {
        mainCategory.textContent = firstJob.main_category;
    } else {
        mainCategory.textContent = ''; // Clear the main category if no jobs
    }
};

// Function to extract the YouTube video ID from the URL
const extractVideoId = (url) => {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v') || url.split('/').pop();
};

// Infinite scrolling: load more jobs when scrolling to the bottom
window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        loadMoreJobs();
    }
});

// Load jobs data when the page is ready
document.addEventListener('DOMContentLoaded', loadJobs);
