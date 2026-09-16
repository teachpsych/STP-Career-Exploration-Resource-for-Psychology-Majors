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
    clearJobs();
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
  clearJobs();
  loadMoreJobs();
};

const clearJobs = () => {
  for (const wrapper of jobslist.querySelectorAll('.video-wrapper')) {
    if (wrapper.__player) commandPlayer(wrapper.__player, 'pauseVideo');
  }
  foreground = null;
  floating = null;
  floatingHistory.length = 0;
  jobslist.replaceChildren();
  delete jobslist.dataset.lastCategory;
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
      <div class="video-wrapper" data-video-id="${videoId}">
        <button class="video-play" type="button" aria-label="Play YouTube video">
          <img crossorigin="anonymous" src="${thumb}" class="video-thumbnail" alt="" loading="lazy" />
          <span class="youtube-logo-background" aria-hidden="true">
            <img class="youtube-logo youtube-logo-dark" src="icons/yt_logo_fullcolor_almostblack_digital.png" alt="" />
            <img class="youtube-logo youtube-logo-light" src="icons/yt_logo_fullcolor_white_digital.png" alt="" />
          </span>
        </button>
        <button class="video-resume" type="button" aria-label="Resume YouTube video">Resume video</button>
      </div>
    `;
  }).join('');
};

/* =========================
   Video floating/docking
========================= */
let foreground = null;
let floating = null;
const floatingHistory = [];

const commandPlayer = (player, command) => {
  player.shouldPlay = command === 'playVideo';
  if (!player.ready) return;
  player.iframe.contentWindow.postMessage(JSON.stringify({
    event: 'command', func: command, args: []
  }), 'https://www.youtube.com');
};

const pausePlayer = (player) => {
  commandPlayer(player, 'pauseVideo');
  player.wrapper.classList.remove('is-active');
  player.wrapper.classList.add('is-paused');
};

const playPlayer = (player) => {
  player.wrapper.classList.remove('is-paused');
  player.wrapper.classList.add('is-active');
  commandPlayer(player, 'playVideo');
};

const restoreFloating = () => {
  while (floatingHistory.length) {
    const player = floatingHistory.pop();
    if (!player.wrapper.isConnected || player === foreground) continue;

    floating = player;
    player.iframe.classList.add('is-floating');
    break;
  }
};

const dockFloating = (player) => {
  player.iframe.classList.remove('is-floating');
  if (floating !== player) return;
  floating = null;
  if (player !== foreground) pausePlayer(player);
  restoreFloating();
};

const promoteFloating = (player) => {
  if (floating === player) return;
  if (floating) {
    floatingHistory.push(floating);
    floating.iframe.classList.remove('is-floating');
    pausePlayer(floating);
  }
  floating = player;
  player.iframe.classList.add('is-floating');
  playPlayer(player);
};

const handlePlayerVisibility = (player, entry) => {
  if (entry.isIntersecting) {
    if (floating === player) dockFloating(player);
    return;
  }
  if (player === foreground) promoteFloating(player);
};

const activatePlayer = (wrapper) => {
  let player = wrapper.__player;
  if (floating && floating !== player) pausePlayer(floating);
  if (foreground && foreground !== player && foreground !== floating) pausePlayer(foreground);
  if (!player) {
    const iframe = document.createElement('iframe');
    iframe.title = 'YouTube video player';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube.com/embed/${wrapper.dataset.videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&rel=0&autoplay=1`;
    wrapper.appendChild(iframe);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === wrapper) handlePlayerVisibility(player, entry);
      }
    }, { threshold: 0 });
    player = { iframe, wrapper, observer, ready: false, shouldPlay: true };
    wrapper.__player = player;
    iframe.addEventListener('load', () => {
      player.ready = true;
      commandPlayer(player, player.shouldPlay ? 'playVideo' : 'pauseVideo');
    });
    observer.observe(wrapper);
  }
  foreground = player;
  playPlayer(player);
};

const chooseYouTubeLogo = (wrapper) => {
  const thumb = wrapper.querySelector('.video-thumbnail');
  if (!thumb || wrapper.__logoChecked) return;
  wrapper.__logoChecked = true;
  thumb.addEventListener('error', () => {
    thumb.removeAttribute('crossorigin');
    thumb.src = thumb.src;
  }, { once: true });
  const choose = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      const sourceX = thumb.naturalWidth * .58;
      const sourceY = thumb.naturalHeight * .68;
      context.drawImage(thumb, sourceX, sourceY,
        thumb.naturalWidth * .42, thumb.naturalHeight * .29, 0, 0, 16, 16);
      const pixels = context.getImageData(0, 0, 16, 16).data;
      let brightness = 0;
      let darkest = 255;
      let lightest = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        brightness += value;
        darkest = Math.min(darkest, value);
        lightest = Math.max(lightest, value);
      }
      const average = brightness / (pixels.length / 4);
      wrapper.classList.toggle('logo-on-light', average > 145);
      wrapper.classList.toggle('logo-needs-background',
        (average > 105 && average < 180) || (darkest < 75 && lightest > 190));
    } catch (_) {
      wrapper.classList.add('logo-needs-background');
    }
  };
  if (thumb.complete && thumb.naturalWidth) choose();
  else thumb.addEventListener('load', choose, { once: true });
};

const setupVideoThumbnails = () => {
  document.querySelectorAll('.video-wrapper').forEach(wrapper => {
    chooseYouTubeLogo(wrapper);
    const playButton = wrapper.querySelector('.video-play');
    if (!playButton || wrapper.__boundClick) return;
    wrapper.__boundClick = true;
    playButton.addEventListener('click', () => activatePlayer(wrapper));
    wrapper.querySelector('.video-resume').addEventListener('click', () => activatePlayer(wrapper));
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
