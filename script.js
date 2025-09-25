/* script.js */
// كامل: responsive canvas (internal 600), drag touch/mouse, dark mode, lang toggle, dashed center lines, checks, edited detection

/* -------- helpers & translations -------- */
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
      ["No strong shadows","shadow"],
      ["Background uniform & light","background"],
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
      ["لا ظلال قوية","shadow"],
      ["الخلفية فاتحة وموحدة","background"],
      ["لم يتم التعديل باستخدام برامج تحرير","edited"]
    ]
  }
};

let lang = 'en';
let themeDark = false;

/* -------- DOM -------- */
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

/* internal canvas logical size */
const CANVAS_SIZE = 600;

/* default lines (in canvas coordinate space) */
let headTopY = 140, chinY = 460, eyeY = 300;
let draggingLine = null;

/* build checks UI */
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

/* translations */
function applyLang(){
  const x = T[lang];
  titleEl.innerText = x.title;
  hintEl.innerText = x.hint;
  uploadBtn.innerHTML = `📁 <span>${x.upload}</span>`;
  checkBtn.innerHTML = `🔍 <span>${x.check}</span>`;
  clearBtn.innerHTML = `🗑️ <span>${x.clear}</span>`;
  resetLinesBtn.innerText = x.reset;
  resultsTitle.innerText = x.results;
  langBtn.innerText = lang==='en'?'AR':'EN';
  buildChecks();
}
applyLang();

/* theme toggle */
function applyTheme(){
  document.body.classList.toggle('dark', themeDark);
  themeBtn.innerText = themeDark?'☀️':'🌙';
}
applyTheme();

/* events for toggles */
langBtn.addEventListener('click', ()=>{ lang = lang==='en'?'ar':'en'; applyLang(); });
themeBtn.addEventListener('click', ()=>{ themeDark = !themeDark; applyTheme(); });

/* upload handlers */
uploadBtn.addEventListener('click', ()=> uploadInput.click());
uploadInput.addEventListener('change', handleUpload);

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function fmtPercent(v){ return (Math.round(v*10)/10).toFixed(1) + '%';}
function clientToCanvasY(clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleY = CANVAS_SIZE / rect.height;
  return clamp((clientY - rect.top) * scaleY, 0, CANVAS_SIZE);
}

/* draw functions */
function clearCanvas(){ ctx.clearRect(0,0,CANVAS_SIZE,CANVAS_SIZE); }
function drawImageScaled(){ if(!originalImage) return; ctx.drawImage(originalImage,0,0,CANVAS_SIZE,CANVAS_SIZE); }
function drawCenterGuides(){
  ctx.save();
  ctx.strokeStyle='rgba(150,150,150,0.6)';
  ctx.setLineDash([6,6]);
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(CANVAS_SIZE/2,0); ctx.lineTo(CANVAS_SIZE/2,CANVAS_SIZE);
  ctx.moveTo(0,CANVAS_SIZE/2); ctx.lineTo(CANVAS_SIZE,CANVAS_SIZE/2);
  ctx.stroke();
  ctx.restore();
}
function drawLinesAndLabels(){
  ctx.save();
  ctx.lineWidth=2;
  ctx.font="14px Cairo, Arial";

  // top (yellow)
  ctx.strokeStyle='#facc15';
  ctx.beginPath(); ctx.moveTo(0,headTopY); ctx.lineTo(CANVAS_SIZE,headTopY); ctx.stroke();
  drawLabel(8, headTopY-6, `top ${fmtPercent((1 - headTopY/CANVAS_SIZE)*100)}`);

  // chin
  ctx.beginPath(); ctx.moveTo(0,chinY); ctx.lineTo(CANVAS_SIZE,chinY); ctx.stroke();
  drawLabel(8, chinY-6, `chin ${fmtPercent((1 - chinY/CANVAS_SIZE)*100)}`);

  // eyes (cyan)
  ctx.strokeStyle='#06b6d4';
  ctx.beginPath(); ctx.moveTo(0,eyeY); ctx.lineTo(CANVAS_SIZE,eyeY); ctx.stroke();
  drawLabel(8, eyeY-6, `eyes ${fmtPercent((1 - eyeY/CANVAS_SIZE)*100)}`);

  ctx.restore();
}
function drawLabel(x,y,text){
  ctx.save();
  ctx.font="13px Cairo, Arial";
  const pad=6,h=18;
  const w=ctx.measureText(text).width+pad*2;
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.fillRect(x,y-h+6,w,h);
  ctx.fillStyle='white';
  ctx.textAlign='left';
  ctx.fillText(text,x+pad,y-h/2+8);
  ctx.restore();
}
function redraw(){
  clearCanvas();
  if(originalImage) drawImageScaled();
  drawCenterGuides();
  drawLinesAndLabels();
}

/* Upload -> draw, read EXIF, auto-detect face */
async function handleUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  uploadedFile=file;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img=new Image();
    img.onload=async ()=>{
      originalImage=img;
      canvas.width=CANVAS_SIZE;
      canvas.height=CANVAS_SIZE;
      clearCanvas();
      drawImageScaled();

      try{ exifData=null; EXIF.getData(img,function(){ exifData=EXIF.getAllTags(this)||null; }); }catch(e){ exifData=null; }

      try{ lastDetection = await faceapi.detectSingleFace(canvas,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(); }catch(e){ lastDetection=null; }

      if(lastDetection){
        const box=lastDetection.detection.box;
        const lm=lastDetection.landmarks;
        const jaw=lm.getJawOutline();
        const leftEye=lm.getLeftEye();
        const rightEye=lm.getRightEye();
        headTopY=clamp(box.y-Math.max(8,box.height*0.06),6,CANVAS_SIZE-6);
        chinY=clamp(jaw[Math.floor(jaw.length/2)].y,6,CANVAS_SIZE-6);
        const leftAvgY=leftEye.reduce((s,p)=>s+p.y,0)/leftEye.length;
        const rightAvgY=rightEye.reduce((s,p)=>s+p.y,0)/rightEye.length;
        eyeY=clamp((leftAvgY+rightAvgY)/2,6,CANVAS_SIZE-6);
      } else { headTopY=140; chinY=460; eyeY=300; }

      buildChecks();
      redraw();
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}

/* Drag (mouse + touch) */
function getClientY(e){ return e.touches?e.touches[0].clientY:e.clientY; }
canvas.addEventListener('mousedown', e=> startDrag(clientToCanvasY(getClientY(e))));
canvas.addEventListener('mousemove', e=> moveDrag(clientToCanvasY(getClientY(e))));
canvas.addEventListener('mouseup', stopDrag);
canvas.addEventListener('mouseleave', stopDrag);
canvas.addEventListener('touchstart', e=> startDrag(clientToCanvasY(getClientY(e))),{passive:false});
canvas.addEventListener('touchmove', e=>{ e.preventDefault(); moveDrag(clientToCanvasY(getClientY(e)));},{passive:false});
canvas.addEventListener('touchend', stopDrag);

function startDrag(y){
  const d1=Math.abs(y-headTopY), d2=Math.abs(y-chinY), d3=Math.abs(y-eyeY);
  const min=Math.min(d1,d2,d3);
  if(min>20){ draggingLine=null; return; }
  draggingLine = min===d1?'headTop':min===d2?'chin':'eye';
}
function moveDrag(y){
  if(!draggingLine) return;
  if(draggingLine==='headTop') headTopY=clamp(y,6,chinY-8);
  else if(draggingLine==='chin') chinY=clamp(y,headTopY+8,CANVAS_SIZE-6);
  else eyeY=clamp(y,6,CANVAS_SIZE-6);
  redraw();
}
function stopDrag(){ draggingLine=null; }

/* reset lines */
resetLinesBtn.addEventListener('click', ()=>{
  headTopY=140;
  chinY=460;
  eyeY=300;
  redraw();
});

/* clear */
clearBtn.addEventListener('click', ()=>{
  uploadedFile=null;
  originalImage=null;
  exifData=null;
  lastDetection=null;
  clearCanvas();
  buildChecks();
});

/* load face-api models */
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models')
]).then(()=>console.log('face-api models loaded'));

/* set check result helper */
function setCheckResult(key,status,message){
  const el=document.getElementById(`${key}-res`);
  if(!el) return;
  el.className=`result ${status}`;
  el.innerText=(status==='pass'?'✅ ':status==='fail'?'❌ ':'⏳ ')+(message||'');
}

/* Check color depth */
function checkColorDepth(){
  if(!originalImage) return 'fail';
  const tmpCanvas=document.createElement('canvas');
  tmpCanvas.width=originalImage.naturalWidth||CANVAS_SIZE;
  tmpCanvas.height=originalImage.naturalHeight||CANVAS_SIZE;
  const tmpCtx=tmpCanvas.getContext('2d');
  tmpCtx.drawImage(originalImage,0,0,tmpCanvas.width,tmpCanvas.height);
  const imgData=tmpCtx.getImageData(0,0,tmpCanvas.width,tmpCanvas.height).data;
  for(let i=0;i<imgData.length;i+=4){ if(imgData[i+3]!==255) return 'fail'; }
  return 'pass';
}

/* Check EXIF date ≤6 months */
function checkExifDate(){
  if(!exifData||!exifData.DateTimeOriginal) return 'fail';
  const dateStr=exifData.DateTimeOriginal.replace(/:/g,'-').replace(' ','T');
  const imgDate=new Date(dateStr);
  const now=new Date();
  const diffMonths=(now.getFullYear()-imgDate.getFullYear())*12 + (now.getMonth()-imgDate.getMonth());
  return diffMonths<=6?'pass':'fail';
}

/* Check software editing */
function checkEdited(){
  if(!exifData) return 'fail';
  const software=exifData.Software||'';
  const edited=/Photoshop|GIMP|Lightroom|Paint/i.test(software);
  return edited?'fail':'pass';
}

/* Check button */
checkBtn.addEventListener('click', async ()=>{
  if(!uploadedFile) return alert(lang==='en'?'Please upload an image first':'الرجاء تحميل صورة أولا');

  try{ lastDetection=await faceapi.detectSingleFace(canvas,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(); }catch(e){ lastDetection=null; }

  const natW=originalImage?.naturalWidth||null;
  const natH=originalImage?.naturalHeight||null;
  setCheckResult('dim', (natW===600 && natH===600)?'pass':'fail', natW? `${natW}×${natH}`:'');
  setCheckResult('size', (uploadedFile.size<=240*1024)?'pass':'fail', `${Math.round(uploadedFile.size/1024)} KB`);
  const isJpg=(uploadedFile.type==='image/jpeg')||/.jpe?g$/i.test(uploadedFile.name);
  setCheckResult('format', isJpg?'pass':'fail', isJpg?'JPG':'Not JPG');
  setCheckResult('filename', /^[a-zA-Z0-9_.-]+$/.test(uploadedFile.name)?'pass':'fail', uploadedFile.name);
  const hasSensitive=exifData&&(exifData.GPSLatitude||exifData.GPSLongitude||exifData.Orientation);
  setCheckResult('exif', hasSensitive?'fail':'pass', hasSensitive?'GPS/Orientation present':'OK');
  setCheckResult('date', checkExifDate(), exifData?.DateTimeOriginal||'');
  setCheckResult('color', checkColorDepth(), checkColorDepth()==='pass'?'24-bit':'with alpha');

  const headHeightPercent=((chinY-headTopY)/CANVAS_SIZE)*100;
  setCheckResult('head', (headHeightPercent>=50 && headHeightPercent<=69)?'pass':'fail', fmtPercent(headHeightPercent));

  const eyeLevelPercent=(1-eyeY/CANVAS_SIZE)*100;
  setCheckResult('eyes', (eyeLevelPercent>=56 && eyeLevelPercent<=69)?'pass':'fail', fmtPercent(eyeLevelPercent));

  if(lastDetection){
    const box=lastDetection.detection.box;
    const lm=lastDetection.landmarks;
    const leftEye=lm.getLeftEye();
    const rightEye=lm.getRightEye();
    const faceCenterX=box.x+box.width/2;
    const deviation=Math.abs(faceCenterX-CANVAS_SIZE/2)/CANVAS_SIZE*100;
    setCheckResult('center', deviation<=5?'pass':'fail', fmtPercent(deviation));

    const leftAvg=leftEye.reduce((s,p)=>({x:s.x+p.x, y:s.y+p.y}), {x:0,y:0});
    leftAvg.x/=leftEye.length; leftAvg.y/=leftEye.length;
    const rightAvg=rightEye.reduce((s,p)=>({x:s.x+p.x, y:s.y+p.y}), {x:0,y:0});
    rightAvg.x/=rightEye.length; rightAvg.y/=rightEye.length;
    const slope=(rightAvg.y-leftAvg.y)/(rightAvg.x-leftAvg.x||0.0001);
    const angle=Math.atan(slope)*180/Math.PI;
    setCheckResult('tilt', Math.abs(angle)<=5?'pass':'fail', `${Math.abs(angle).toFixed(1)}°`);
  } else {
    setCheckResult('center','fail','Auto-detect failed');
    setCheckResult('tilt','fail','Auto-detect failed');
  }

  const imgData=ctx.getImageData(0,0,CANVAS_SIZE,CANVAS_SIZE).data;
  let min=255,max=0;
  for(let i=0;i<imgData.length;i+=4){
    const v=0.299*imgData[i]+0.587*imgData[i+1]+0.114*imgData[i+2];
    if(v<min) min=v; if(v>max) max
  }
  const contrastPercent = ((max - min) / 255) * 100;
  setCheckResult('contrast', contrastPercent > 40 ? 'pass' : 'fail', `${contrastPercent.toFixed(1)}%`);

  // Shadow check: أي مناطق مظلمة جدًا
  let shadowFail = false;
  for (let i = 0; i < imgData.length; i += 4) {
    const v = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
    if (v < 30) { shadowFail = true; break; }
  }
  setCheckResult('shadow', shadowFail ? 'fail' : 'pass');

  // Background uniformity: فحص الزوايا
  const corners = [
    [0, 0],
    [CANVAS_SIZE - 1, 0],
    [0, CANVAS_SIZE - 1],
    [CANVAS_SIZE - 1, CANVAS_SIZE - 1]
  ];
  let bgFail = false;
  corners.forEach(([x, y]) => {
    const i = (y * CANVAS_SIZE + x) * 4;
    const v = (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
    if (v < 180) bgFail = true;
  });
  setCheckResult('background', bgFail ? 'fail' : 'pass');

  // Edited detection
  setCheckResult('edited', checkEdited(), exifData?.Software || '');
});

/* initial draw */
redraw();
