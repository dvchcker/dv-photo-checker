/* script.js - version without background & shadow checks */

// النصوص (لغتين: عربي / إنجليزي)
const T = {
  en: {
    title: "DV Photo Checker",
    hint: "Drag yellow lines (top/chin) or blue line (eyes). Tap Check.",
    upload: "Upload",
    check: "Check",
    clear: "Clear",
    reset: "Reset Lines",
    results: "Results",
    items: [
      ["Dimensions must be 600×600 px","dim"],
      ["File size ≤ 240 KB","size"],
      ["Format: JPG only","format"],
      ["Filename valid (letters/numbers/_ . -)","filename"],
      ["photo: no GPS/Orientation","exif"],
      ["photo date ≤6 months old","date"],
      ["Color depth 24-bit","color"],
      ["Head height (chin→top) 50%–69%","head"],
      ["Eye level 56%–69%","eyes"],
      ["Face centered ±5%","center"],
      ["Head tilt ≤5°","tilt"],
      ["Contrast ok","contrast"],
      ["No software editing detected","edited"]
    ]
  },
  ar: {
    title: "مدقق صورة القرعة (DV)",
    hint: "اسحب الخط الأصفر (أعلى الرأس/الذقن) أو الأزرق (العين). ثم اضغط فحص.",
    upload: "تحميل",
    check: "فحص",
    clear: "مسح",
    reset: "إعادة تعيين الخطوط",
    results: "النتائج",
    items: [
      ["الأبعاد يجب أن تكون 600×600 بكسل","dim"],
      ["حجم الملف اقل من 240 كيلوبايت","size"],
      ["الصيغة JPG فقط","format"],
      ["اسم الملف صالح (أحرف/أرقام/_ . -)","filename"],
      ["بيانات الصورة الحساسة GPS/Orientation","exif"],
      ["تاريخ الصورة يجب ان لا يتعدى 6 اشهر","date"],
      ["عمق الألوان 24 بت","color"],
      ["ارتفاع الرأس (من الذقن إلى أعلى) 50%–69%","head"],
      ["مستوى العينين 56%–69%","eyes"],
      ["الوجه في المركز ±5%","center"],
      ["ميلان الرأس ≤5°","tilt"],
      ["التباين جيد","contrast"],
      ["لم يتم التعديل باستخدام برامج تحرير","edited"]
    ]
  }
};

let lang = 'en';
let themeDark = false;

/* DOM elements */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const uploadInput = document.getElementById('upload');
const uploadBtn = document.getElementById('uploadBtn');
const checkBtn = document.getElementById('checkBtn');
const clearBtn = document.getElementById('clearBtn');
const resetLinesBtn = document.getElementById('resetLines');
const langBtn = document.getElementById('langBtn');
const themeBtn = document.getElementById('themeBtn');
const checksList = document.getElementById('checksList');
const hintEl = document.getElementById('hint');
const titleEl = document.getElementById('title');
const resultsTitle = document.getElementById('resultsTitle');

let uploadedFile = null;
let originalImage = null;
let exifData = null;
let lastDetection = null;

/* إعدادات الرسم */
const CANVAS_SIZE = 600;
let headTopY = 140, chinY = 460, eyeY = 300;
let draggingLine = null;

/* UI build: إنشاء قائمة الفحوص */
function buildChecks() {
  checksList.innerHTML = '';
  const items = T[lang].items;
  for (let i=0;i<items.length;i++){
    const [label,key] = items[i];
    const div = document.createElement('div');
    div.className = 'checkItem card';
    div.innerHTML = `<div class="label">${label}</div><div class="result pending" id="${key}-res">⏳</div>`;
    checksList.appendChild(div);
  }
}
buildChecks();

/* تغيير اللغة */
function applyLang(){
  const x = T[lang];
  titleEl.innerText = x.title;
  hintEl.innerText = x.hint;
  uploadBtn.innerHTML = `📁 ${x.upload}`;
  checkBtn.innerHTML = `🔍 ${x.check}`;
  clearBtn.innerHTML = `🗑️ ${x.clear}`;
  resetLinesBtn.innerText = x.reset;
  resultsTitle.innerText = x.results;
  langBtn.innerText = lang === 'en' ? 'AR' : 'EN';
  buildChecks();
}
applyLang();

/* تغيير المظهر */
function applyTheme(){
  document.body.classList.toggle('dark', themeDark);
  themeBtn.innerText = themeDark ? '☀️' : '🌙';
}
applyTheme();

/* أزرار التحكم */
langBtn.addEventListener('click', ()=>{ lang = lang === 'en' ? 'ar' : 'en'; applyLang(); });
themeBtn.addEventListener('click', ()=>{ themeDark = !themeDark; applyTheme(); });
uploadBtn.addEventListener('click', ()=> uploadInput.click());
uploadInput.addEventListener('change', handleUpload);

/* Helpers */
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function fmtPercent(v){ return (Math.round(v*10)/10).toFixed(1) + '%';}
function clientToCanvasY(clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleY = CANVAS_SIZE / rect.height;
  return clamp((clientY - rect.top) * scaleY, 0, CANVAS_SIZE);
}

/* الرسم */
function clearCanvas(){ ctx.clearRect(0,0,CANVAS_SIZE,CANVAS_SIZE); }
function drawImageScaled(){ if (!originalImage) return; ctx.drawImage(originalImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE); }
function drawCenterGuides(){ ctx.save(); ctx.strokeStyle = 'rgba(150,150,150,0.6)'; ctx.setLineDash([6,6]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(CANVAS_SIZE/2,0); ctx.lineTo(CANVAS_SIZE/2,CANVAS_SIZE); ctx.moveTo(0,CANVAS_SIZE/2); ctx.lineTo(CANVAS_SIZE,CANVAS_SIZE/2); ctx.stroke(); ctx.restore(); }
function drawLinesAndLabels(){
  ctx.save(); ctx.lineWidth = 2; ctx.font = "14px Cairo, Arial";
  ctx.strokeStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(0,headTopY); ctx.lineTo(CANVAS_SIZE,headTopY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,chinY); ctx.lineTo(CANVAS_SIZE,chinY); ctx.stroke();
  ctx.strokeStyle = '#06b6d4'; ctx.beginPath(); ctx.moveTo(0, eyeY); ctx.lineTo(CANVAS_SIZE, eyeY); ctx.stroke();
  ctx.restore();
}
function redraw(){ clearCanvas(); if (originalImage) drawImageScaled(); drawCenterGuides(); drawLinesAndLabels(); }

/* رفع صورة */
async function handleUpload(e){
  const file = e.target.files[0];
  if (!file) return;
  uploadedFile = file;
  const reader = new FileReader();
  reader.onload = async ()=>{
    const img = new Image();
    img.onload = async ()=>{
      originalImage = img;
      canvas.width = CANVAS_SIZE; canvas.height = CANVAS_SIZE;
      clearCanvas(); drawImageScaled();

      try{ exifData = null; EXIF.getData(img, function(){ exifData = EXIF.getAllTags(this) || null; }); }catch(e){ exifData = null; }
      try{ lastDetection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(); }catch(e){ lastDetection = null; }

      buildChecks(); redraw();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* Drag lines */
function getClientY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }
canvas.addEventListener('mousedown', e=> startDrag(clientToCanvasY(getClientY(e))));
canvas.addEventListener('mousemove', e=> moveDrag(clientToCanvasY(getClientY(e))));
canvas.addEventListener('mouseup', stopDrag); canvas.addEventListener('mouseleave', stopDrag);
canvas.addEventListener('touchstart', e=> startDrag(clientToCanvasY(getClientY(e))), {passive:false});
canvas.addEventListener('touchmove', e=>{ e.preventDefault(); moveDrag(clientToCanvasY(getClientY(e))); }, {passive:false});
canvas.addEventListener('touchend', stopDrag);
function startDrag(y){ const d1=Math.abs(y-headTopY),d2=Math.abs(y-chinY),d3=Math.abs(y-eyeY); const min=Math.min(d1,d2,d3); if(min>20){ draggingLine=null; return; } draggingLine = min===d1?'headTop':min===d2?'chin':'eye'; }
function moveDrag(y){ if(!draggingLine) return; if(draggingLine==='headTop') headTopY=clamp(y,6,chinY-8); else if(draggingLine==='chin') chinY=clamp(y,headTopY+8,CANVAS_SIZE-6); else eyeY=clamp(y,6,CANVAS_SIZE-6); redraw(); }
function stopDrag(){ draggingLine=null; }
resetLinesBtn.addEventListener('click', ()=>{ headTopY=140; chinY=460; eyeY=300; redraw(); });
clearBtn.addEventListener('click', ()=>{ uploadedFile = null; originalImage = null; exifData = null; lastDetection = null; clearCanvas(); buildChecks(); });

/* تحميل نماذج face-api */
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models')
]);

/* Helpers */
function setCheckResult(key, status, message){
  const el = document.getElementById(`${key}-res`);
  if(!el) return;
  el.className = `result ${status}`;
  el.innerText = (status==='pass'?'✅ ':status==='fail'?'❌ ':'⏳ ') + (message||'');
}

/* فحوص تقنية */
function checkColorDepth(){
  if(!originalImage) return 'fail';
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = originalImage.naturalWidth || CANVAS_SIZE;
  tmpCanvas.height = originalImage.naturalHeight || CANVAS_SIZE;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(originalImage,0,0,tmpCanvas.width,tmpCanvas.height);
  const imgData = tmpCtx.getImageData(0,0,tmpCanvas.width,tmpCanvas.height).data;
  for(let i=0;i<imgData.length;i+=4){
    if(imgData[i+3] !== 255) return 'fail';
  }
  return 'pass';
}
function checkExifDate(){
  if(!exifData || !exifData.DateTimeOriginal) return 'fail';
  const dateStr = exifData.DateTimeOriginal.replace(/:/g,'-').replace(' ','T');
  const imgDate = new Date(dateStr);
  const now = new Date();
  const diffMonths = (now.getFullYear()-imgDate.getFullYear())*12 + (now.getMonth()-imgDate.getMonth());
  return (diffMonths <= 6) ? 'pass' : 'fail';
}
function checkEdited(){
  if(!exifData) return 'fail';
  const software = exifData.Software || '';
  const edited = /Photoshop|GIMP|Lightroom|Paint/i.test(software);
  return edited ? 'fail' : 'pass';
}

/* زر الفحص */
checkBtn.addEventListener('click', async ()=>{
  if(!uploadedFile) return alert(lang==='en'?'Please upload an image first':'الرجاء تحميل صورة أولا');

  try{ lastDetection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(); }catch(e){ lastDetection=null; }

  const natW = originalImage?.naturalWidth || null;
  const natH = originalImage?.naturalHeight || null;
  setCheckResult('dim', (natW===600 && natH===600)?'pass':'fail', natW? `${natW}×${natH}` : '');
  setCheckResult('size', (uploadedFile.size <= 240*1024)?'pass':'fail', `${Math.round(uploadedFile.size/1024)} KB`);
  const isJpg = (uploadedFile.type==='image/jpeg') || /.jpe?g$/i.test(uploadedFile.name);
  setCheckResult('format', isJpg?'pass':'fail', isJpg?'JPG':'Not JPG');
  setCheckResult('filename', /^[a-zA-Z0-9_.-]+$/.test(uploadedFile.name)?'pass':'fail', uploadedFile.name);
  const hasSensitive = exifData && (exifData.GPSLatitude || exifData.GPSLongitude || exifData.Orientation);
  setCheckResult('exif', hasSensitive?'fail':'pass', hasSensitive?'GPS/Orientation present':'OK');
  setCheckResult('date', checkExifDate(), exifData?.DateTimeOriginal || '');
  setCheckResult('color', checkColorDepth(), checkColorDepth()==='pass'?'24-bit':'with alpha');

  if (lastDetection) {
    const box = lastDetection.detection.box;
    const headPercent = (chinY - headTopY)/CANVAS_SIZE*100;
    setCheckResult('head', (headPercent>=50 && headPercent<=69)?'pass':'fail', `${fmtPercent(headPercent)}`);
    const eyePercent = (1 - eyeY/CANVAS_SIZE)*100;
    setCheckResult('eyes', (eyePercent>=56 && eyePercent<=69)?'pass':'fail', `${fmtPercent(eyePercent)}`);
    const centerX = box.x + box.width/2;
    const off = Math.abs(centerX - CANVAS_SIZE/2)/CANVAS_SIZE*100;
    setCheckResult('center', off<=5?'pass':'fail', `${fmtPercent(off)}`);
    const jaw = lastDetection.landmarks.getJawOutline();
    const dx = jaw[jaw.length-1].x - jaw[0].x;
    
    const tilt = Math.atan2(dy,dx)*180/Math.PI;
    setCheckResult('tilt', Math.abs(tilt)<5?'pass':'fail', `${tilt.toFixed(1)}°`);
  } else {
    setCheckResult('head','fail','No face');
    setCheckResult('eyes','fail','No face');
    setCheckResult('center','fail','No face');
    setCheckResult('tilt','fail','No face');
  }

  if (originalImage) {
    const tmp = document.createElement('canvas'); tmp.width = CANVAS_SIZE; tmp.height = CANVAS_SIZE;
    const tctx = tmp.getContext('2d'); tctx.drawImage(originalImage,0,0,CANVAS_SIZE,CANVAS_SIZE);
    const data = tctx.getImageData(0,0,CANVAS_SIZE,CANVAS_SIZE).data;
    let sum=0, sum2=0, count=data.length/4;
    for (let i=0;i<data.length;i+=4){
      const lum=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
      sum+=lum; sum2+=lum*lum;
    }
    const mean=sum/count; const std=Math.sqrt(sum2/count-mean*mean);
    setCheckResult('contrast', std>30?'pass':'fail', `σ=${std.toFixed(1)}`);
  } else {
    setCheckResult('contrast','fail','No image');
  }

  setCheckResult('edited', checkEdited());
});

/* initial draw */
redraw();
