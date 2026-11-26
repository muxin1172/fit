/* P1-7 integration: await PhotoTools.compress(file) BEFORE imagePut/upload.
 * Returns a Blob (use blob.type for extensions; the original filename may be wrong).
 * PhotoTools.open([{blob, alt, caption}, ...], index) opens only on explicit call.
 * Lazy entries: {getBlob:()=>imageGet(id), caption}; only the current entry loads.
 * Existing {photo: Blob} entries also work. Nothing scans IndexedDB or thumbnails.
 */
(function (root) {
  'use strict';
  const MAX_EDGE = 1600, MAX_BYTES = 1500000, TARGET_BYTES = 500000;
  const doc = root.document;
  let viewer = null;
  function isBlob(value) {
    return !!value && typeof value.size === 'number' && typeof value.slice === 'function' && typeof value.arrayBuffer === 'function';
  }
  async function decode(blob) {
    if (root.createImageBitmap) {
      try {
        const image = await root.createImageBitmap(blob);
        return {image, width: image.width, height: image.height, release: () => image.close()};
      } catch (_) { /* Some browser decoders support more formats through <img>. */ }
    }
    return new Promise((resolve, reject) => {
      const url = root.URL.createObjectURL(blob), image = new root.Image();
      image.onload = () => { root.URL.revokeObjectURL(url); resolve({image, width: image.naturalWidth, height: image.naturalHeight, release() {}}); };
      image.onerror = () => { root.URL.revokeObjectURL(url); reject(new Error('无法读取照片，请选择浏览器支持的图片格式。')); };
      image.src = url;
    });
  }
  function encode(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob(resolve, type, quality); } catch (error) { reject(error); }
    });
  }
  async function compress(blob) {
    if (!isBlob(blob) || blob.size <= 0) throw new TypeError('请选择非空照片。');
    if (blob.type && !blob.type.startsWith('image/')) throw new TypeError('请选择图片文件。');
    if (!doc) throw new Error('照片压缩需要浏览器 Canvas。');
    const source = await decode(blob);
    let canvas;
    try {
      if (!(source.width > 0 && source.height > 0)) throw new Error('照片尺寸无效。');
      canvas = doc.createElement('canvas');
      const ratio = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
      let width = Math.max(1, Math.round(source.width * ratio)), height = Math.max(1, Math.round(source.height * ratio));
      let type = 'image/webp', best = null;
      for (let pass = 0; pass < 9; pass++) {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法创建照片画布。');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
        context.drawImage(source.image, 0, 0, width, height);
        for (const quality of [0.82, 0.72, 0.62, 0.5]) {
          let output;
          try { output = await encode(canvas, type, quality); } catch (error) { if (type !== 'image/webp') throw error; }
          // Unsupported encoders may silently return PNG rather than WebP.
          if (type === 'image/webp' && (!output || output.type !== 'image/webp')) {
            type = 'image/jpeg'; output = await encode(canvas, type, quality);
          }
          if (!output || output.type !== type || output.size === 0) throw new Error('照片压缩失败。');
          if (!best || output.size < best.size) best = output;
          if (output.size <= TARGET_BYTES) return output;
        }
        // Resize only after trying the requested initial quality and lower qualities.
        // This also bounds pathological/noisy photos instead of returning >1.5 MB.
        width = Math.max(1, Math.floor(width * 0.8)); height = Math.max(1, Math.floor(height * 0.8));
      }
      if (best && best.size <= MAX_BYTES) return best;
      throw new Error('照片压缩后仍超过 1.5 MB，请选择较小的照片。');
    } finally {
      source.release();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }
  function close() { viewer?.close(); }
  function open(items, initialIndex = 0) {
    if (!Array.isArray(items) || !items.length) throw new RangeError('没有可查看的照片。');
    if (!doc?.body) throw new Error('照片查看器需要浏览器页面。');
    close();
    const photos = items.slice(), trigger = doc.activeElement, overflow = doc.body.style.overflow;
    let index = 0, generation = 0, objectURL = null, closed = false;
    const overlay = doc.createElement('div');
    overlay.id = 'motionlog-photo-viewer'; overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '照片预览');
    overlay.innerHTML = `<style>
      #motionlog-photo-viewer{box-sizing:border-box;position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080d14f7;color:#f0f4fb;font:inherit;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);overscroll-behavior:contain}
      #motionlog-photo-viewer header,#motionlog-photo-viewer footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;flex:none}
      #motionlog-photo-viewer button{box-sizing:border-box;min-width:48px;min-height:48px;border:1px solid #435264;border-radius:10px;background:#192334;color:#f0f4fb;font:inherit;cursor:pointer}
      #motionlog-photo-viewer button:focus-visible{outline:2px solid #92e3cc;outline-offset:2px}
      #motionlog-photo-viewer button:disabled{opacity:.35;cursor:default}
      #motionlog-photo-viewer figure{min-width:0;min-height:0;flex:1;display:flex;align-items:center;justify-content:center;margin:0;padding:0 10px;overflow:hidden}
      #motionlog-photo-viewer img{display:block;width:100%;height:100%;object-fit:contain;min-height:0}
      #motionlog-photo-viewer img[hidden]{display:none}
      #motionlog-photo-viewer .photo-caption{flex:1;text-align:center;font-size:13px;overflow-wrap:anywhere;max-height:18vh;overflow:auto}
    </style><header><span class="photo-counter" aria-live="polite"></span><button type="button" data-close aria-label="关闭照片预览">✕</button></header><figure><img hidden alt=""><span class="photo-message" role="status"></span></figure><footer><button type="button" data-prev aria-label="上一张照片">←</button><span class="photo-caption"></span><button type="button" data-next aria-label="下一张照片">→</button></footer>`;
    const image = overlay.querySelector('img'), message = overlay.querySelector('.photo-message');
    const previous = overlay.querySelector('[data-prev]'), next = overlay.querySelector('[data-next]');
    function revoke() {
      image.onload = null; image.onerror = null; image.removeAttribute('src');
      if (objectURL) { root.URL.revokeObjectURL(objectURL); objectURL = null; }
    }
    async function goTo(value) {
      if (closed) return;
      index = Math.max(0, Math.min(photos.length - 1, Math.trunc(Number(value)) || 0));
      const token = ++generation, item = photos[index];
      revoke(); image.hidden = true; message.hidden = false; message.textContent = '正在加载照片…';
      overlay.querySelector('.photo-counter').textContent = `${index + 1} / ${photos.length}`;
      overlay.querySelector('.photo-caption').textContent = item?.caption || '';
      image.alt = item?.alt || item?.caption || `照片 ${index + 1}`;
      previous.disabled = index === 0; next.disabled = index === photos.length - 1;
      try {
        let blob = isBlob(item) ? item : item?.blob ?? item?.photo;
        if (blob == null && typeof item?.getBlob === 'function') blob = item.getBlob();
        if (typeof blob === 'function') blob = blob();
        blob = await blob;
        if (closed || token !== generation) return;
        if (!isBlob(blob) || blob.size <= 0) throw new Error('照片暂不可用。');
        objectURL = root.URL.createObjectURL(blob);
        image.onload = () => { if (token === generation && !closed) { image.hidden = false; message.hidden = true; } };
        image.onerror = () => {
          if (token !== generation || closed) return;
          image.hidden = true; message.hidden = false; message.textContent = '无法显示这张照片。'; revoke();
        };
        image.src = objectURL;
      } catch (_) {
        if (!closed && token === generation) message.textContent = '照片暂不可用，请联网同步后重试。';
      }
    }
    function keydown(event) {
      if (closed) return;
      if (!['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') controller.close();
      if (event.key === 'ArrowLeft') controller.previous();
      if (event.key === 'ArrowRight') controller.next();
      if (event.key === 'Tab') {
        const buttons = Array.from(overlay.querySelectorAll('button')).filter(button => !button.disabled);
        const current = buttons.indexOf(doc.activeElement);
        const step = event.shiftKey ? -1 : 1;
        buttons[(current + step + buttons.length) % buttons.length].focus();
      }
    }
    const controller = {
      close() {
        if (closed) return;
        closed = true; generation++; revoke();
        doc.removeEventListener('keydown', keydown, true);
        overlay.remove(); doc.body.style.overflow = overflow;
        if (viewer === controller) viewer = null;
        if (trigger?.isConnected) trigger.focus({preventScroll: true});
      },
      next: () => goTo(index + 1), previous: () => goTo(index - 1), goTo
    };
    overlay.querySelector('[data-close]').addEventListener('click', controller.close);
    previous.addEventListener('click', controller.previous); next.addEventListener('click', controller.next);
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.tagName === 'FIGURE') controller.close(); });
    doc.addEventListener('keydown', keydown, true); doc.body.style.overflow = 'hidden';
    doc.body.append(overlay); viewer = controller;
    overlay.querySelector('[data-close]').focus();
    void goTo(initialIndex);
    return controller;
  }
  root.PhotoTools = Object.freeze({compress, open, close});
})(typeof window === 'undefined' ? globalThis : window);
