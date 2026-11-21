'use strict';

const camera = document.getElementById('camera');
const gallery = document.getElementById('gallery');
const takePhoto = document.getElementById('take-photo');
const chooseImage = document.getElementById('choose-image');
const status = document.getElementById('status');
const result = document.getElementById('result');
const content = document.getElementById('content');
const copy = document.getElementById('copy');
const openLink = document.getElementById('open-link');
const crop = document.getElementById('crop');
const preview = document.getElementById('preview');
const readCrop = document.getElementById('read-crop');
const resetCrop = document.getElementById('reset-crop');
const context = preview.getContext('2d');
let detector;
let sourceImage;
let imageUrl;
let busy = false;
// Coordinates are fractions of the original image, independent of screen size.
let selection;
let drag;

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function validSelection() {
  return selection && sourceImage &&
    selection.width * sourceImage.naturalWidth >= 16 &&
    selection.height * sourceImage.naturalHeight >= 16;
}

function setBusy(value) {
  busy = value;
  takePhoto.disabled = chooseImage.disabled = camera.disabled = gallery.disabled = value;
  readCrop.disabled = value || !validSelection();
  resetCrop.disabled = value;
  preview.setAttribute('aria-disabled', String(value));
  document.querySelector('main').setAttribute('aria-busy', String(value));
}

function releaseImage() {
  if (sourceImage) sourceImage.removeAttribute('src');
  sourceImage = undefined;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  selection = drag = undefined;
  crop.hidden = true;
  preview.width = preview.height = 1;
}

function drawPreview() {
  context.drawImage(sourceImage, 0, 0, preview.width, preview.height);
  if (!selection) return;
  const x = selection.x * preview.width;
  const y = selection.y * preview.height;
  const width = selection.width * preview.width;
  const height = selection.height * preview.height;
  context.fillStyle = 'rgba(0, 0, 0, .55)';
  context.fillRect(0, 0, preview.width, y);
  context.fillRect(0, y, x, height);
  context.fillRect(x + width, y, preview.width - x - width, height);
  context.fillRect(0, y + height, preview.width, preview.height - y - height);
  context.strokeStyle = '#fff';
  context.lineWidth = 4;
  context.strokeRect(x, y, width, height);
  context.strokeStyle = '#24569b';
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
}

function showCrop() {
  const scale = Math.min(1, 1000 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
  preview.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
  preview.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
  crop.hidden = false;
  drawPreview();
}

function showResult(codes) {
  if (!codes.length) return false;
  const text = codes[0].rawValue;
  content.value = text;
  openLink.hidden = true;
  openLink.removeAttribute('href');
  // QR contents are plain text; only explicit HTTP(S) addresses become links.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        openLink.href = url.href;
        openLink.hidden = false;
      }
    } catch { /* Invalid addresses remain plain text. */ }
  }
  result.hidden = false;
  releaseImage();
  setStatus('Odczytano kod QR.');
  return true;
}

async function initialize() {
  try {
    if (!window.isSecureContext || !('BarcodeDetector' in window) ||
        !(await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
      throw new Error('QR unavailable');
    }
    detector = new BarcodeDetector({ formats: ['qr_code'] });
    setBusy(false);
    setStatus('Wybierz zdjęcie, aby odczytać kod QR.');
  } catch {
    setStatus('Odczyt QR jest niedostępny na tym urządzeniu lub w tej przeglądarce. Użyj aktualnego Chrome lub Brave na Androidzie z usługami Google Play i otwórz stronę przez HTTPS.', true);
  }
}

async function readImage(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file || !detector || busy) return;

  releaseImage();
  setBusy(true);
  result.hidden = true;
  content.value = '';
  openLink.hidden = true;
  openLink.removeAttribute('href');
  setStatus('Odczytywanie kodu QR…');

  let decoded = false;
  try {
    sourceImage = new Image();
    imageUrl = URL.createObjectURL(file);
    sourceImage.src = imageUrl;
    await sourceImage.decode();
    decoded = true;
    if (!showResult(await detector.detect(sourceImage))) {
      showCrop();
      setStatus('Nie znaleziono kodu QR. Zaznacz go na zdjęciu i spróbuj ponownie lub zrób nowe zdjęcie.', true);
    }
  } catch {
    if (decoded) {
      showCrop();
      setStatus('Nie udało się odczytać całego zdjęcia. Zaznacz fragment z kodem QR i spróbuj ponownie.', true);
    } else {
      releaseImage();
      setStatus('Nie udało się otworzyć obrazu. Spróbuj zrobić nowe zdjęcie lub wybierz plik JPG, PNG albo WebP.', true);
    }
  } finally {
    input.value = '';
    setBusy(false);
  }
}

function point(event) {
  const rect = preview.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  };
}

preview.addEventListener('pointerdown', event => {
  if (busy || !sourceImage || drag || !event.isPrimary || event.button !== 0) return;
  preview.focus({ preventScroll: true });
  preview.setPointerCapture(event.pointerId);
  drag = { ...point(event), id: event.pointerId, previous: selection };
  selection = undefined;
  readCrop.disabled = true;
  drawPreview();
});

function updateSelection(event) {
  const end = point(event);
  selection = {
    x: Math.min(drag.x, end.x), y: Math.min(drag.y, end.y),
    width: Math.abs(end.x - drag.x), height: Math.abs(end.y - drag.y)
  };
  drawPreview();
}

preview.addEventListener('pointermove', event => {
  if (drag && event.pointerId === drag.id) updateSelection(event);
});
preview.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  updateSelection(event);
  drag = undefined;
  preview.releasePointerCapture(event.pointerId);
  readCrop.disabled = !validSelection();
  setStatus(validSelection() ? 'Zaznaczono obszar. Wybierz „Odczytaj zaznaczenie”.' :
    'Zaznacz większy obszar, przeciągając palcem po całym kodzie QR.', !validSelection());
});

function cancelDrag() {
  if (!drag) return;
  selection = drag.previous;
  drag = undefined;
  drawPreview();
  readCrop.disabled = busy || !validSelection();
}
preview.addEventListener('pointercancel', cancelDrag);
preview.addEventListener('lostpointercapture', cancelDrag);

preview.addEventListener('keydown', event => {
  if (busy || !sourceImage || drag || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (!validSelection()) selection = { x: .2, y: .2, width: .6, height: .6 };
  const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
  const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -.02 : .02;
  if (event.shiftKey) {
    const dimension = horizontal ? 'width' : 'height';
    const origin = horizontal ? 'x' : 'y';
    selection[dimension] = Math.max(.02, Math.min(1 - selection[origin], selection[dimension] + delta));
  } else {
    const origin = horizontal ? 'x' : 'y';
    const dimension = horizontal ? 'width' : 'height';
    selection[origin] = Math.max(0, Math.min(1 - selection[dimension], selection[origin] + delta));
  }
  drawPreview();
  readCrop.disabled = !validSelection();
});

resetCrop.addEventListener('click', () => {
  if (busy || !sourceImage) return;
  selection = undefined;
  drawPreview();
  readCrop.disabled = true;
  setStatus('Zaznacz cały kod QR z niewielkim marginesem.');
});

readCrop.addEventListener('click', async () => {
  if (busy || drag || !validSelection()) return;
  setBusy(true);
  setStatus('Odczytywanie zaznaczonego fragmentu…');
  const fragment = document.createElement('canvas');
  try {
    // Crop original pixels, never the scaled preview or its selection overlay.
    const x = Math.floor(selection.x * sourceImage.naturalWidth);
    const y = Math.floor(selection.y * sourceImage.naturalHeight);
    const width = Math.min(sourceImage.naturalWidth - x, Math.ceil(selection.width * sourceImage.naturalWidth));
    const height = Math.min(sourceImage.naturalHeight - y, Math.ceil(selection.height * sourceImage.naturalHeight));
    const scale = Math.min(1, 2400 / Math.max(width, height));
    fragment.width = Math.max(1, Math.round(width * scale));
    fragment.height = Math.max(1, Math.round(height * scale));
    fragment.getContext('2d').drawImage(sourceImage, x, y, width, height, 0, 0, fragment.width, fragment.height);
    if (!showResult(await detector.detect(fragment))) {
      setStatus('Nie znaleziono kodu w zaznaczeniu. Obejmij cały kod z marginesem lub zrób wyraźniejsze zdjęcie.', true);
    }
  } catch {
    setStatus('Nie udało się odczytać zaznaczenia. Zmień obszar lub zrób nowe zdjęcie i spróbuj ponownie.', true);
  } finally {
    fragment.width = fragment.height = 1;
    setBusy(false);
  }
});

takePhoto.addEventListener('click', () => camera.click());
chooseImage.addEventListener('click', () => gallery.click());
camera.addEventListener('change', readImage);
gallery.addEventListener('change', readImage);
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(content.value);
    setStatus('Skopiowano wynik.');
  } catch {
    content.focus();
    content.select();
    content.setSelectionRange(0, content.value.length);
    setStatus('Nie udało się skopiować automatycznie. Treść została zaznaczona — przytrzymaj ją i wybierz „Kopiuj”.', true);
  }
});

initialize();
