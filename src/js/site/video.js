/*
 * Essential Blocks "Advanced video" block.
 *
 * The original used react-player (React + hls.js + dash.js + flv.js, ~1.6 MB).
 * The block on this site always shows a poster image with a play icon and
 * loads the YouTube player only when it is activated, so the same behaviour
 * is reproduced here with a few lines of plain JavaScript and the same DOM
 * classes (eb-react-player / react-player__preview) used by the stylesheets.
 */
(function () {
  'use strict';

  function youtubeId(url) {
    var m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  }

  function embedUrl(option) {
    var id = youtubeId(option.dataset.url);
    if (!id) return null;
    var params = new URLSearchParams({
      autoplay: '1',
      mute: option.dataset.muted === 'true' ? '1' : '0',
      controls: option.dataset.controls === 'true' ? '1' : '0',
      playsinline: '1',
      enablejsapi: '0',
    });
    if (option.dataset.loop === 'true') {
      params.set('loop', '1');
      params.set('playlist', id);
    }
    return 'https://www.youtube.com/embed/' + id + '?' + params.toString();
  }

  function play(option, player) {
    var src = embedUrl(option);
    if (!src) {
      window.open(option.dataset.url, '_blank', 'noopener');
      return;
    }
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'YouTube video player';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.setAttribute('frameborder', '0');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    player.innerHTML = '';
    player.appendChild(iframe);
  }

  function init(option) {
    var player = document.createElement('div');
    player.className = 'eb-react-player';
    player.style.width = '100%';
    player.style.height = '100%';
    var preview = document.createElement('div');
    preview.className = 'react-player__preview';
    preview.tabIndex = 0;
    preview.setAttribute('role', 'button');
    preview.setAttribute('aria-label', 'Play video');
    preview.style.cssText =
      'width: 100%; height: 100%; background-size: cover; background-position: center center; cursor: pointer; display: flex; align-items: center; justify-content: center;';
    if (option.dataset.light) preview.style.backgroundImage = 'url("' + option.dataset.light + '")';
    var icon = document.createElement('i');
    icon.className = option.dataset.customplayiconlib || 'fas fa-play-circle';
    preview.appendChild(icon);
    player.appendChild(preview);
    option.appendChild(player);
    preview.addEventListener('click', function () {
      play(option, player);
    });
    preview.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        play(option, player);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.eb-player-option').forEach(init);
  });
})();
