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
    jobslist.innerHTML = ""; // clear list
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

  appendJobs(nextJobs);
};

const resetJobs = () => {
  filteredJobs = [];
  displayedJobs = [];
  currentIndex = 0;
  jobslist.innerHTML = ""; // clear out old jobs
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
   Render (APPEND instead of replace)
========================= */
const appendJobs = (jobs) => {
  let lastCategory = jobslist.dataset.lastCategory || '';

  jobs.forEach(({ main_category, jobTitle, job }) => {
    const isNewCategory = main_category !== lastCategory;
    if (isNewCategory) {
      const h2 = document.createElement('h2');
      h2.className = 'main-category';
      h2.textContent = main_category;
      jobslist.appendChild(h2);
    }

    const section = document.createElement('div');
    section.className = 'job-section';
    section.innerHTML = `
      <h3 class="job-title">${jobTitle}</h3>
      <span class="degree-box">Degree Required: ${job.degree_required}</span>
      <ul class="links-list">${generateLinksHtml(job.links)}</ul>
      <div class="videos-container">${generateVideosHtml(job.videos)}</div>
      <div class="jobs-table">${job.jobs_table || ''}</div>
    `;
    jobslist.appendChild(section);

    lastCategory = main_category;
  });

  jobslist.dataset.lastCategory = lastCategory;
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
   Video floating/docking (preserve iframe)
========================= */
let active = null;

const setStyles = (el, styles) => {
  for (const k in styles) el.style[k] = styles[k];
};

const createPlayerInWrapper = (wrapper, videoId) => {
  const rect = wrapper.getBoundingClientRect();
  const wrapperWidth = Math.max(1, rect.width);
  const wrapperHeight = Math.max(1, rect.height);

  const iframe = document.createElement('iframe');
  const playerId = `ytp_${Math.random().toString(36).slice(2)}`;

  iframe.setAttribute('title', 'YouTube video player');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.dataset.playerId = playerId;
  iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&autoplay=1`;

  setStyles(iframe, {
    position: 'absolute',
    inset: '0px',
    width: '100%',
    height: '100%',
    zIndex: ''
  });

  wrapper.innerHTML = '';
  wrapper.appendChild(iframe);

  iframe.addEventListener('load', () => {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: playerId }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'addEventListener',
        args: ['onStateChange']
      }), '*');
    } catch (_) {}
  });

  const floatW = Math.round(Math.min(320, Math.max(200, wrapperWidth * 0.5)));
  const floatH = Math.round(floatW * 9 / 16);

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target !== wrapper) continue;
      if (!active || active.iframe !== iframe) return;

      if (!entry.isIntersecting) {
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

  active = { iframe, wrapper, observer };
};

let ytListenerAttached = false;
const ensureYouTubeListener = () => {
  if (ytListenerAttached) return;
  ytListenerAttached = true;

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'string') return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data) return;

    if (!active || !active.iframe || event.source !== active.iframe.contentWindow) return;

    const isPause =
      (data.event === 'infoDelivery' && data.info && data.info.playerState === 2) ||
      (data.event === 'onStateChange' && data.info === 2);

    if (isPause) {
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

const setupVideoThumbnails = () => {
  ensureYouTubeListener();

  document.querySelectorAll('.video-wrapper').forEach(wrapper => {
    const thumb = wrapper.querySelector('.video-thumbnail');
    if (!thumb) return;

    const videoId = wrapper.dataset.videoId;

    if (wrapper.__boundClick) return;
    wrapper.__boundClick = true;

    thumb.addEventListener('click', () => {
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

      createPlayerInWrapper(wrapper, videoId);
    });
  });
};

/* =========================
   Misc
========================= */
const updateMainCategory = (jobs) => {
  const firstJob = jobs[0];
  if (firstJob) mainCategory.textContent = firstJob.main_category;
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
