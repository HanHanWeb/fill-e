const h=React.createElement;
const {useState,useEffect,useRef}=React;
const {ConfigProvider,Button,Input,Slider,Segmented,Select,Switch,ColorPicker,Tooltip,message}=antd;
const defaults={letter:'E',density:90,clarity:62,weight:75,wave:false,amplitude:16,frequency:35,direction:'horizontal',angle:0,fg:'#26351e',bg:'#f3f5df',invert:false,omitBackground:true,backgroundStrength:45,transparent:false};
// 采样结果只跟图片与网格尺寸有关，缓存起来供后续参数微调复用（WeakMap 随图片释放）。
const pixelCache=new WeakMap();
function imagePixels(img,w,ht){let m=pixelCache.get(img);if(!m){m=new Map();pixelCache.set(img,m)}const k=w+'x'+ht;if(m.has(k))return m.get(k);const c=document.createElement('canvas');c.width=w;c.height=ht;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,ht);x.drawImage(img,0,0,w,ht);const data=x.getImageData(0,0,w,ht).data;m.set(k,data);return data}
// 填充字母用可变字重网页字体渲染（wght 100-900），支持任意字母、数字、汉字。
const FONT_STACK='"Noto Sans SC Variable","Noto Sans SC","Microsoft YaHei",sans-serif';
// 背景掩码由采样像素推导，同样缓存，避免调色/调清晰度时重算。
const bgCache=new WeakMap();
const backgroundOf=(pixels,cols,rows,strength)=>{let m=bgCache.get(pixels);if(!m){m=new Map();bgCache.set(pixels,m)}if(m.has(strength))return m.get(strength);const v=detectBackground(pixels,cols,rows,strength);m.set(strength,v);return v};

let measureCtx=null;
// 测量字符在字体里的实际高宽，缩放到占格子高度 0.8，并给出让字符包围盒居中的基线偏移。
function glyphMetrics(letter,cell){
  if(!measureCtx)measureCtx=document.createElement('canvas').getContext('2d');
  const probe=cell*1.1;
  measureCtx.font='500 '+probe+'px '+FONT_STACK;
  const m=measureCtx.measureText(letter);
  const asc=m.actualBoundingBoxAscent||probe*.75,desc=m.actualBoundingBoxDescent||probe*.05;
  const fontSize=Math.max(4,probe*Math.min(3,cell*.8/Math.max(1,asc+desc)));
  return{fontSize,yOff:-(asc-desc)/2*(fontSize/probe)};
}
const escapeXml=s=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));

function renderArtwork(img,p,target,asSvg=false,width=1200){
  const W=width,H=Math.round(W*img.height/img.width),cols=p.density,cell=W/cols,rows=Math.max(1,Math.ceil(H/cell));
  const pixels=imagePixels(img,cols,rows),parts=[],ctx=asSvg?null:target.getContext('2d');
  const background=p.omitBackground?backgroundOf(pixels,cols,rows,p.backgroundStrength):null;
  const letter=(p.letter||'E').charAt(0)||'E';
  const{fontSize,yOff}=glyphMetrics(letter,cell);
  let placed=0;
  if(ctx){target.width=W;target.height=H;if(!p.transparent){ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H)}ctx.fillStyle=p.fg;ctx.textAlign='center';ctx.textBaseline='alphabetic'}
  const angle=p.angle*Math.PI/180;
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
    if(background&&background[r*cols+col])continue;
    placed++;
    const i=(r*cols+col)*4,lum=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255;
    let dark=Math.max(0,Math.min(1,(1-lum-.5)*(0.3+p.clarity/28)+.5));if(p.invert)dark=1-dark;
    const weight=Math.max(100,Math.min(900,Math.round((100+dark*800*p.weight/75)/4)*4));
    const phase=p.direction==='horizontal'?col/cols:p.direction==='vertical'?r/rows:(col/cols+r/rows)*.707;
    const wave=p.wave?Math.sin(phase*(1+p.frequency/8)*Math.PI*2)*cell*(p.amplitude/45):0;
    let px=(col+.5)*cell,py=(r+.5)*cell;
    if(p.direction==='vertical')px+=wave;else if(p.direction==='diagonal'){px+=wave*.707;py+=wave*.707}else py+=wave;
    if(asSvg){parts.push('<text x="'+px.toFixed(2)+'" y="'+(py+yOff).toFixed(2)+'" font-weight="'+weight+'" font-size="'+fontSize.toFixed(2)+'"'+(p.angle?' transform="rotate('+p.angle+' '+px.toFixed(2)+' '+py.toFixed(2)+')"':'')+'>'+escapeXml(letter)+'</text>')}
    else{ctx.save();ctx.translate(px,py);if(angle)ctx.rotate(angle);ctx.font=weight+' '+fontSize.toFixed(2)+'px '+FONT_STACK;ctx.fillText(letter,0,yOff);ctx.restore()}
  }
  if(asSvg)return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><title>Fill-Letter</title>'+(p.transparent?'':'<rect width="100%" height="100%" fill="'+p.bg+'"/>')+'<g fill="'+p.fg+'" font-family=\''+FONT_STACK+'\' text-anchor="middle">'+parts.join('')+'</g></svg>';
  return{W,H,count:placed};
}

function App(){const [p,setP]=useState(defaults),[source,setSource]=useState(null),[img,setImg]=useState(null),[view,setView]=useState('生成作品'),[info,setInfo]=useState({W:'—',H:'—',count:0}),[renderW,setRenderW]=useState(1200);const canvas=useRef(),file=useRef(),frame=useRef(),wrap=useRef();const [api,holder]=message.useMessage();
useEffect(()=>{if(!source)return;let alive=true;const i=new Image();i.onload=()=>{if(alive)setImg(i)};i.onerror=()=>api.error('图片无法读取，请使用 JPG、PNG 或 WebP。');i.src=source;return()=>{alive=false}},[source]);
// 填充字母依赖网页字体；等字体（含对应字符的子集）就绪后再重渲染一次。
const [fontTick,setFontTick]=useState(0);
useEffect(()=>{let alive=true;const letter=(p.letter||'E').charAt(0);document.fonts.load('100 32px "Noto Sans SC Variable"',letter).catch(()=>{}).then(()=>{if(alive&&document.fonts.check('100 32px "Noto Sans SC Variable"',letter))setFontTick(t=>t+1)});return()=>{alive=false}},[p.letter]);
// 预览按显示宽度渲染：留 1.5 倍超采样防锯齿，最高 2400（与上传分辨率上限一致），保证位图始终不低于显示分辨率。
useEffect(()=>{const el=wrap.current;if(!el)return;const update=()=>{const w=Math.max(600,Math.min(2400,Math.ceil(el.clientWidth*(window.devicePixelRatio||1)*1.5)));setRenderW(v=>v===w?v:w)};update();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[]);
useEffect(()=>{if(!img||!canvas.current)return;cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{const c=canvas.current;if(view==='原始图片'){c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);return}const r=renderArtwork(img,p,c,false,renderW);setInfo({W:img.width,H:img.height,count:r.count})});return()=>cancelAnimationFrame(frame.current)},[img,p,view,renderW,fontTick]);
function update(key,value){setP(old=>({...old,[key]:value}))}
function upload(f){if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){api.error('请上传 JPG、PNG 或 WebP 图片。');return}if(f.size>20*1024*1024){api.error('图片需小于 20 MB。');return}const reader=new FileReader();reader.onload=()=>{const check=new Image();check.onload=()=>{const resize=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(check.width,check.height));resize.width=Math.max(1,Math.round(check.width*scale));resize.height=Math.max(1,Math.round(check.height*scale));resize.getContext('2d').drawImage(check,0,0,resize.width,resize.height);setSource(resize.toDataURL('image/png'));setView('生成作品');api.success('照片已载入，开始你的视觉实验。')};check.onerror=()=>api.error('图片文件损坏或格式不受支持。');check.src=reader.result};reader.onerror=()=>api.error('文件读取失败，请重试。');reader.readAsDataURL(f);file.current.value=''}
// 只导出 SVG，按源图宽度输出，可无限缩放。
function download(){if(!img)return;const a=document.createElement('a'),w=img.width;const url=URL.createObjectURL(new Blob([renderArtwork(img,p,null,true,w)],{type:'image/svg+xml'}));a.href=url;a.download='Fill-Letter-'+Date.now()+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);api.success('作品已导出 · SVG '+w+'px')}
const fieldLabel=(icon,text)=>h('span',{className:'field-label'},text);
const slider=(key,label,icon,min,max,suffix='',help=null)=>h('div',{className:'field'},h('div',{className:'field-head'},fieldLabel(icon,label),h('span',{className:'field-value'},p[key]+suffix)),h(Slider,{min,max,value:p[key],onChange:v=>update(key,v),'aria-label':label}),help&&h('div',{className:'field-help'},help));
const section=(label,icon,...children)=>h('div',{className:'control-section'},h('div',{className:'section-label'},h(Icon,{name:icon,size:12}),label),...children);
const openGuide=()=>antd.Modal.info({
  title:'从照片到字母视觉',
  content:h('div',{className:'guide'},
    h('p',null,'1. 点击预览区上传 JPG、PNG 或 WebP 照片，也可直接拖入。'),
    h('p',null,'2. 字母与细节：可指定任意字母、数字或汉字作为填充字符，明暗自动映射为它的笔画粗细，用密度、清晰度、粗细决定保留多少细节。'),
    h('p',null,'3. 波纹与方向：开启波纹让排列产生流动感，可调方向、幅度、频率与字母朝向。'),
    h('p',null,'4. 色彩表达：设定字母与背景颜色，也可反转明暗。'),
    h('p',null,'5. 导出：点击「导出作品」一键保存 SVG，尺寸与原图一致，可无限缩放；也可开启透明背景。'),
    h('p',{className:'guide-note'},'所有图像处理均在你的浏览器内完成，照片不会上传到任何服务器。')
  ),
  okText:'开始创作'
});
// 首次访问自动弹出使用说明；用 localStorage 记住已读，之后不再打扰。
useEffect(()=>{let seen=false;try{seen=localStorage.getItem('fill-e-guide')==='1';if(!seen)localStorage.setItem('fill-e-guide','1')}catch(e){}if(!seen)openGuide()},[]);

const preview=h('section',{className:'preview-panel'},
  h('div',{className:'panel-head'},
    h('div',{className:'panel-title'},h(Icon,{name:'aperture',size:14}),'作品预览'),
    h(Segmented,{options:['生成作品','原始图片'],value:view,onChange:setView})
  ),
  h('div',{className:'canvas-area'+(img?'':' empty'),
    style:img?null:{cursor:'pointer'},
    onClick:!img?()=>file.current.click():null,
    onDragOver:e=>e.preventDefault(),
    onDrop:e=>{e.preventDefault();upload(e.dataTransfer.files[0])}
  },
    h('input',{ref:file,type:'file',accept:'image/jpeg,image/png,image/webp',style:{display:'none'},onChange:e=>upload(e.target.files[0])}),
    h('div',{className:'art-wrap',ref:wrap},
      h('canvas',{ref:canvas,style:img?null:{display:'none'},'aria-label':view+'：由指定字母构成的作品',role:'img'})
    ),
    !img&&h('div',{className:'empty-hint'},
      h('div',{className:'empty-card'},
        h('span',{className:'empty-icon'},h(Icon,{name:'image-plus',size:26})),
        h('div',{className:'empty-title'},'上传图片'),
        h('div',{className:'empty-sub'},'点击选择或拖入图片'),
        h('div',{className:'empty-formats'},'JPG · PNG · WebP · 最大 20 MB')
      )
    )
  ),
  h('div',{className:'preview-foot'},
    h('span',null,h(Icon,{name:'maximize-2',size:12,style:{marginRight:5,verticalAlign:-2}}),info.W+' × '+info.H+' px',
      h('span',{style:{marginLeft:16}},h(Icon,{name:'type',size:12,style:{marginRight:5,verticalAlign:-2}}),info.count.toLocaleString()+' 个字母'+(p.letter&&p.letter.charAt(0)!=='E'?'（'+p.letter.charAt(0)+'）':''))
    ),
    h('div',null,h('span',{className:'dot'}),'实时渲染')
  )
);

const letterControls=section('字母与细节','type',
  h('div',{className:'field'},
    h('div',{className:'field-head'},fieldLabel(null,'填充字母'),h('span',{className:'field-value'},p.letter||'E')),
    h(Input,{value:p.letter,maxLength:1,onChange:e=>update('letter',e.target.value),'aria-label':'填充字母',placeholder:'E'}),
    h('div',{className:'field-help'},'任意字母、数字或汉字，整个画面将由它填充')
  ),
  slider('density','字母密度','grid-3x3',10,150,'','越密集，越能保留照片中的细节'),
  slider('clarity','内容清晰度','focus',0,100,'%'),
  slider('weight','笔画粗细','bold',20,120,'%'),
  h('div',{className:'field'},
    h('div',{className:'field-head'},fieldLabel('eraser','背景留白'),h(Switch,{'aria-label':'背景留白',size:'small',checked:p.omitBackground,onChange:v=>update('omitBackground',v)})),
    h('div',{className:'field-help'},'识别边缘相连的相似色背景，留白区域不放置字母。')
  ),
  p.omitBackground&&slider('backgroundStrength','留白强度','contrast',0,100,'%','越高，留白范围越大；适合纯色、天空等简单背景。')
);

const waveControls=section('波纹与方向','waves',
  h('div',{className:'field'},
    h('div',{className:'field-head'},fieldLabel('zap','启用波纹'),h(Switch,{size:'small','aria-label':'启用波纹',checked:p.wave,onChange:v=>update('wave',v)})),
    h('div',{className:'field-help'},'开启后可调节波纹方向、幅度与频率。')
  ),
  ...(p.wave?[
    h('div',{className:'field'},
      h('div',{className:'field-head'},fieldLabel('compass','波纹方向')),
      h(Segmented,{block:true,options:[
        {label:h('span',{className:'seg-label'},'横向'),value:'horizontal'},
        {label:h('span',{className:'seg-label'},'纵向'),value:'vertical'},
        {label:h('span',{className:'seg-label'},'斜向'),value:'diagonal'}
      ],value:p.direction,onChange:v=>update('direction',v)})
    ),
    slider('amplitude','波纹幅度','arrow-up-down',0,60),slider('frequency','波纹频率','activity',0,100),
    h('div',{className:'field'},
      h('div',{className:'field-head'},fieldLabel('rotate-cw','字母朝向')),
      h(Select,{value:p.angle,onChange:v=>update('angle',v),options:[{label:'E / 0°',value:0},{label:'旋转 90°',value:90},{label:'旋转 180°',value:180},{label:'旋转 270°',value:270}]})
    )
  ]:[])
);

const colorControls=section('色彩表达','palette',
  h('div',{className:'color-row'},...[
    ['fg','type','字母颜色'],['bg','square','背景颜色']
  ].map(([key,icon,label])=>
    h('div',{className:'color-field',key:key},fieldLabel(icon,label),
      h('div',{className:'swatch-label'},h(ColorPicker,{value:p[key],disabledAlpha:true,onChange:c=>update(key,c.toHexString())}),p[key].toUpperCase())
    )
  )),
  h('div',{className:'field-head',style:{marginTop:16,marginBottom:0}},fieldLabel('flip-horizontal-2','反转明暗'),h(Switch,{size:'small','aria-label':'反转明暗',checked:p.invert,onChange:v=>update('invert',v)}))
);

const exportControls=h('div',{className:'export'},
  h('div',{className:'field-head',style:{marginTop:0,marginBottom:0}},fieldLabel('square-dashed','透明背景'),h(Switch,{size:'small','aria-label':'透明背景',checked:p.transparent,onChange:v=>update('transparent',v)})),
  h(Button,{type:'primary',block:true,style:{marginTop:14,background:'#d8f77c',color:'#2c371a',borderColor:'#d8f77c'},onClick:download,disabled:!img},
    h(Icon,{name:'download',size:14,style:{marginRight:6,verticalAlign:-2}}),'导出作品 SVG'
  )
);

const controls=h('aside',{className:'controls'},
  h('div',{className:'controls-title'},h('span',{className:'controls-title-main'},h(Icon,{name:'sliders-horizontal',size:14}),'创作面板'),
    h(Button,{size:'small',onClick:()=>{setP({...defaults});setView('生成作品');api.success('参数已重置')}},
      h(Icon,{name:'rotate-ccw',size:13,style:{marginRight:4,verticalAlign:-2}}),'重置'
    )
  ),
  letterControls,waveControls,colorControls,exportControls
);

return h(ConfigProvider,{theme:{
  token:{colorPrimary:'#748b47',borderRadius:6,fontFamily:'"Noto Sans SC","Microsoft YaHei",sans-serif',colorText:'#32382b',controlHeight:34},
  components:{Button:{primaryShadow:'none'},Segmented:{itemSelectedBg:'#fff',trackBg:'#f2f4ef'}}
}},holder,
  h('main',{className:'main'},
    h('div',{className:'intro'},
      h('div',null,h('h1',null,'让每一张照片，有新的秩序。'),h('p',null,'从明暗到笔画，从影像到字母。用你选择的字母，探索你的视觉语言。')),
      h(Button,{onClick:openGuide},'使用指南',h(Icon,{name:'square-arrow-out-up-right',size:13,style:{marginLeft:5,verticalAlign:-2}}))
    ),
    h('div',{className:'workspace'},h('div',{className:'preview-column'},preview),controls)
  )
);
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
