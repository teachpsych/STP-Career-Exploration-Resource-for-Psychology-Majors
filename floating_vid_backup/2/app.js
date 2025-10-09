const jobslist = document.getElementById('jobslist');
const searchBar = document.getElementById('searchBar');
const mainCategory = document.getElementById('mainCategory');
let jobData = [];
let displayedJobs = [];
let filteredJobs = [];
const chunkSize = 20;
let currentIndex = 0;

/* =========================
   Search
========================= */
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

/* =========================
   Load jobs
========================= */
const loadJobs = async () => {
  try {
    const res = await fetch('jobs.json');
    jobData = await res.json();
    loadMoreJobs();
  } catch (err) {
    console.error(err);
  }
};

/* =========================
   Infinite scroll
========================= */
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

const resetJobs = () => {
  filteredJobs = [];
  displayedJobs = [];
  currentIndex = 0;
  loadMoreJobs();
};

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

/* =========================
   Render
========================= */
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

const generateLinksHtml = (links) => {
  return links.map(link => `
    <li class="link">
      <span class="category">${link.category}</span>
      <a href="${link.url}" target="_blank">${link.page_title || link.url}</a>
    </li>
  `).join('');
};

/* Thumbnails: responsive 16:9 box */
const generateVideosHtml = (videos) => {
  return videos.map(video => {
    const videoId = extractVideoId(video.url);
    const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return `
      <div class="video-wrapper" data-video-id="${videoId}"
           style="position:relative; width:100%; max-width:560px; aspect-ratio:16/9; margin-bottom:20px;">
        <img src="${thumb}" class="video-thumbnail"
             style="cursor:pointer; position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
             alt="Click to play video" />
      </div>
    `;
  }).join('');
};

/* =========================
   Video floating/docking
   - Never recreate/move iframe in DOM
   - Only toggle CSS so playback state is preserved
========================= */

/** Active player state */
let active = null; // { iframe, wrapper, wrapperRect, floatingSize, observer }

/** Utility: set multiple styles */
const setStyles = (el, styles) => {
  for (const k in styles) el.style[k] = styles[k];
};

/** Create player in-place (replacing thumbnail) */
const createPlayerInWrapper = (wrapper, videoId) => {
  // Compute sizes from wrapper
  const rect = wrapper.getBoundingClientRect();
  const wrapperWidth = Math.max(1, rect.width);
  const wrapperHeight = Math.max(1, rect.height);

  // Build iframe
  const iframe = document.createElement('iframe');
  const playerId = `ytp_${Math.random().toString(36).slice(2)}`;

  iframe.setAttribute('title', 'YouTube video player');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.dataset.playerId = playerId;

  // Enable JS API & autoplay on click
  iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&autoplay=1`;

  // Fill wrapper (docked state)
  setStyles(iframe, {
    position: 'absolute',
    inset: '0px',
    width: '100%',
    height: '100%',
    zIndex: ''
  });

  // Replace thumbnail
  wrapper.innerHTML = '';
  wrapper.appendChild(iframe);

  // Enable YT messages
  iframe.addEventListener('load', () => {
    try {
      // Start listening and subscribe to onStateChange
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: playerId }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'addEventListener',
        args: ['onStateChange']
      }), '*');
    } catch (_) {}
  });

  // Floating size (smaller): cap to 320px or 50% of wrapper
  const floatW = Math.round(Math.min(320, Math.max(200, wrapperWidth * 0.5)));
  const floatH = Math.round(floatW * 9 / 16);

  // Intersection observer to float/dock
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target !== wrapper) continue;
      if (!active || active.iframe !== iframe) return;

      if (!entry.isIntersecting) {
        // Float to corner (smaller)
        setStyles(iframe, {
          position: 'fixed',
          width: `${floatW}px`,
          height: `${floatH}px`,
          bottom: '20px',
          right: '20px',
          inset: '',
          zIndex: '9999'
        });
      } else {
        // Dock back in wrapper (keep state)
        setStyles(iframe, {
          position: 'absolute',
          inset: '0px',
          width: '100%',
          height: '100%',
          bottom: '',
          right: '',
          zIndex: ''
        });
      }
    }
  }, { threshold: 0 });

  observer.observe(wrapper);

  // Save active
  active = {
    iframe,
    wrapper,
    wrapperRect: { width: wrapperWidth, height: wrapperHeight },
    floatingSize: { width: floatW, height: floatH },
    observer
  };
};

/** Ensure we only attach one global message listener */
let ytListenerAttached = false;
const ensureYouTubeListener = () => {
  if (ytListenerAttached) return;
  ytListenerAttached = true;

  window.addEventListener('message', (event) => {
    // We only care about messages that parse as JSON
    if (!event.data || typeof event.data !== 'string') return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data) return;

    // Must have an active player
    if (!active || !active.iframe || event.source !== active.iframe.contentWindow) return;

    // Detect pause either via infoDelivery.playerState === 2
    // or direct onStateChange === 2
    const isPause =
      (data.event === 'infoDelivery' && data.info && data.info.playerState === 2) ||
      (data.event === 'onStateChange' && data.info === 2);

    if (isPause) {
      // Redock (but do NOT recreate or move the iframe)
      setStyles(active.iframe, {
        position: 'absolute',
        inset: '0px',
        width: '100%',
        height: '100%',
        bottom: '',
        right: '',
        zIndex: ''
      });
    }
  });
};

/** Set up click-to-play for each thumbnail */
const setupVideoThumbnails = () => {
  ensureYouTubeListener();

  document.querySelectorAll('.video-wrapper').forEach(wrapper => {
    const thumb = wrapper.querySelector('.video-thumbnail');
    if (!thumb) return;

    const videoId = wrapper.dataset.videoId;

    // Avoid double-binding
    if (wrapper.__boundClick) return;
    wrapper.__boundClick = true;

    thumb.addEventListener('click', () => {
      // If a player already exists elsewhere, pause it and clear its observer
      if (active && active.iframe && active.iframe.contentWindow) {
        try {
          active.iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'pauseVideo'
          }), '*');
        } catch (_) {}
        if (active.observer) active.observer.disconnect();
        active = null;
      }

      // Create and manage this new player in-place
      createPlayerInWrapper(wrapper, videoId);
    });
  });
};

/* =========================
   Misc
========================= */
const updateMainCategory = (jobs) => {
  const firstJob = jobs[0];
  mainCategory.textContent = firstJob ? firstJob.main_category : '';
};

const extractVideoId = (url) => {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get('v') || url.split('/').pop();
};

window.addEventListener('scroll', () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
    loadMoreJobs();
  }
});

document.addEventListener('DOMContentLoaded', loadJobs);
