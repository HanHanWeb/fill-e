const h=React.createElement;
const {useState,useEffect,useRef}=React;
const {ConfigProvider,Button,Slider,Segmented,Select,Switch,ColorPicker,Tooltip,message}=antd;
const defaults={density:90,clarity:62,weight:75,wave:false,amplitude:16,frequency:35,direction:'horizontal',angle:0,fg:'#26351e',bg:'#f3f5df',invert:false,omitBackground:true,backgroundStrength:45};
const presets=[{name:'秩序山峦',sub:'细腻 · 自然 · 低幅波纹',colors:['#26351e','#f3f5df'],values:defaults},{name:'蓝色频率',sub:'高对比 · 斜向 · 流动',colors:['#2143dc','#eaf0ff'],values:{...defaults,wave:true,fg:'#2143dc',bg:'#eaf0ff',direction:'diagonal',amplitude:35,frequency:48,density:75,clarity:78}},{name:'日落信号',sub:'暖色 · 纵向 · 粗颗粒',colors:['#f56935','#2b2423'],values:{...defaults,wave:true,fg:'#f56935',bg:'#2b2423',direction:'vertical',amplitude:24,density:58,weight:90,invert:true}}];
function sampleImage(){const c=document.createElement('canvas');c.width=1200;c.height=1000;const x=c.getContext('2d');let g=x.createLinearGradient(0,0,0,1000);g.addColorStop(0,'#e8e8e8');g.addColorStop(1,'#aaa');x.fillStyle=g;x.fillRect(0,0,1200,1000);x.fillStyle='#f9f9f9';x.beginPath();x.arc(925,190,68,0,Math.PI*2);x.fill();function ridge(base,amp,seed,color){x.beginPath();x.moveTo(0,1000);for(let i=0;i<=1200;i+=3){let y=base+Math.sin(i*.005+seed)*amp+Math.sin(i*.014+seed*2)*amp*.43+Math.sin(i*.032+seed)*amp*.11;x.lineTo(i,y)}x.lineTo(1200,1000);x.closePath();x.fillStyle=color;x.fill()}ridge(480,145,1.8,'#b7b7b7');ridge(570,175,4.2,'#909090');ridge(655,160,1.1,'#656565');ridge(770,140,3.8,'#3f3f3f');ridge(915,75,6,'#202020');x.globalAlpha=9/255;for(let pass=0;pass<2;pass++){x.fillStyle=pass?'#ffffff':'#000000';for(let i=pass;i<22000;i+=2){const px=(Math.sin(i*33.33)*.5+.5)*1200,py=(Math.cos(i*15.73)*.5+.5)*1000;x.fillRect(px,py,2,2)}}x.globalAlpha=1;return c.toDataURL('image/png')}
const sample=sampleImage();
// 采样结果只跟图片与网格尺寸有关，缓存起来供后续参数微调复用（WeakMap 随图片释放）。
const pixelCache=new WeakMap();
function imagePixels(img,w,ht){let m=pixelCache.get(img);if(!m){m=new Map();pixelCache.set(img,m)}const k=w+'x'+ht;if(m.has(k))return m.get(k);const c=document.createElement('canvas');c.width=w;c.height=ht;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,ht);x.drawImage(img,0,0,w,ht);const data=x.getImageData(0,0,w,ht).data;m.set(k,data);return data}
// 字体母版轮廓起点不同，先对齐左上角顶点再插值，保证形变连续。
const alignedGlyphs=puhuiGlyphs.map(g=>{
  const vertices=g.commands.filter(c=>c.type==='M'||c.type==='L').map(({x,y})=>({x,y}));
  const first=vertices[0],last=vertices[vertices.length-1];
  if(first.x===last.x&&first.y===last.y)vertices.pop();
  const start=vertices.reduce((best,v,i)=>v.y<vertices[best].y||(v.y===vertices[best].y&&v.x<vertices[best].x)?i:best,0);
  const ordered=vertices.slice(start).concat(vertices.slice(0,start));
  return{...g,commands:ordered.map((v,i)=>({type:i===0?'M':'L',...v})).concat({type:'Z'})};
});
const glyphHeight=Math.max(...alignedGlyphs.map(g=>g.bounds.y2-g.bounds.y1));
const glyphShapes=Array.from({length:256},(_,index)=>{
  const position=index/255*(alignedGlyphs.length-1),lower=Math.floor(position),upper=Math.min(alignedGlyphs.length-1,lower+1),t=position-lower;
  const a=alignedGlyphs[lower],b=alignedGlyphs[upper];
  const compatible=a.commands.length===b.commands.length&&a.commands.every((c,i)=>c.type===b.commands[i].type);
  const commands=compatible?a.commands.map((c,i)=>Object.fromEntries(Object.entries(c).map(([key,value])=>[key,key==='type'?value:value+(b.commands[i][key]-value)*t]))):(t<.5?a:b).commands;
  const bounds=compatible?Object.fromEntries(Object.keys(a.bounds).map(key=>[key,a.bounds[key]+(b.bounds[key]-a.bounds[key])*t])):(t<.5?a:b).bounds;
  const num=n=>Number(n.toFixed(3));
  const d=commands.map(c=>c.type==='Z'?'Z':c.type==='M'||c.type==='L'?c.type+num(c.x)+' '+num(c.y):c.type==='Q'?'Q'+num(c.x1)+' '+num(c.y1)+' '+num(c.x)+' '+num(c.y):'C'+num(c.x1)+' '+num(c.y1)+' '+num(c.x2)+' '+num(c.y2)+' '+num(c.x)+' '+num(c.y)).join('');
  return{d,path:new Path2D(d),cx:(bounds.x1+bounds.x2)/2,cy:(bounds.y1+bounds.y2)/2};
});
// 质量档位映射输出宽度；"高"直接用源图宽度，不做放大。
const qualityWidth=(level,img)=>level==='high'?img.width:level==='medium'?1200:800;
const qualityLabel={low:'低',medium:'中',high:'高'};

// 背景掩码由采样像素推导，同样缓存，避免调色/调清晰度时重算。
const bgCache=new WeakMap();
const backgroundOf=(pixels,cols,rows,strength)=>{let m=bgCache.get(pixels);if(!m){m=new Map();bgCache.set(pixels,m)}if(m.has(strength))return m.get(strength);const v=detectBackground(pixels,cols,rows,strength);m.set(strength,v);return v};

function renderArtwork(img,p,target,asSvg=false,width=1200){
  const W=width,H=Math.round(W*img.height/img.width),cols=p.density,cell=W/cols,rows=Math.max(1,Math.ceil(H/cell));
  const pixels=imagePixels(img,cols,rows),uses=[],used=new Set(),ctx=asSvg?null:target.getContext('2d');
  const background=p.omitBackground?backgroundOf(pixels,cols,rows,p.backgroundStrength):null;
  let placed=0;
  if(ctx){target.width=W;target.height=H;ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H);ctx.fillStyle=p.fg}
  const scale=cell*.78/glyphHeight,angle=p.angle*Math.PI/180;
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
    if(background&&background[r*cols+col])continue;
    placed++;
    const i=(r*cols+col)*4,lum=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255;
    let dark=Math.max(0,Math.min(1,(1-lum-.5)*(0.3+p.clarity/28)+.5));if(p.invert)dark=1-dark;
    const glyphIndex=Math.round(Math.max(0,Math.min(1,dark*p.weight/75))*255),glyph=glyphShapes[glyphIndex];
    const phase=p.direction==='horizontal'?col/cols:p.direction==='vertical'?r/rows:(col/cols+r/rows)*.707;
    const wave=p.wave?Math.sin(phase*(1+p.frequency/8)*Math.PI*2)*cell*(p.amplitude/45):0;
    let px=(col+.5)*cell,py=(r+.5)*cell;
    if(p.direction==='vertical')px+=wave;else if(p.direction==='diagonal'){px+=wave*.707;py+=wave*.707}else py+=wave;
    if(asSvg){used.add(glyphIndex);uses.push('<use href="#e'+glyphIndex+'" transform="translate('+px.toFixed(3)+' '+py.toFixed(3)+') rotate('+p.angle+') scale('+scale.toFixed(8)+') translate('+(-glyph.cx).toFixed(3)+' '+(-glyph.cy).toFixed(3)+')"/>')}
    else{ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.scale(scale,scale);ctx.translate(-glyph.cx,-glyph.cy);ctx.fill(glyph.path);ctx.restore()}
  }
  if(asSvg)return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><title>Fill-E — Alibaba PuHuiTi 3.0</title><defs>'+[...used].map(i=>'<path id="e'+i+'" d="'+glyphShapes[i].d+'"/>').join('')+'</defs><rect width="100%" height="100%" fill="'+p.bg+'"/><g fill="'+p.fg+'">'+uses.join('')+'</g></svg>';
  return{W,H,count:placed};
}

function App(){const [p,setP]=useState(defaults),[source,setSource]=useState(sample),[img,setImg]=useState(null),[view,setView]=useState('生成作品'),[format,setFormat]=useState('png'),[quality,setQuality]=useState('medium'),[preset,setPreset]=useState(0),[info,setInfo]=useState({W:1200,H:1000,count:6750}),[renderW,setRenderW]=useState(1200);const canvas=useRef(),file=useRef(),frame=useRef(),wrap=useRef();const [api,holder]=message.useMessage();
useEffect(()=>{let alive=true;const i=new Image();i.onload=()=>{if(alive)setImg(i)};i.onerror=()=>api.error('图片无法读取，请使用 JPG、PNG 或 WebP。');i.src=source;return()=>{alive=false}},[source]);
// 预览按显示宽度渲染：留 1.5 倍超采样防锯齿，最高不超过基准 1200，避免大屏无谓放大。
useEffect(()=>{const el=wrap.current;if(!el)return;const update=()=>{const w=Math.max(600,Math.min(1200,Math.ceil(el.clientWidth*(window.devicePixelRatio||1)*1.5)));setRenderW(v=>v===w?v:w)};update();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[]);
useEffect(()=>{if(!img||!canvas.current)return;cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{const c=canvas.current;if(view==='原始图片'){c.width=renderW;c.height=Math.round(renderW*img.height/img.width);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return}const r=renderArtwork(img,p,c,false,renderW);setInfo({W:1200,H:Math.round(1200*img.height/img.width),count:r.count})});return()=>cancelAnimationFrame(frame.current)},[img,p,view,renderW]);
function update(key,value){setP(old=>({...old,[key]:value}));setPreset(-1)}
function upload(f){if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){api.error('请上传 JPG、PNG 或 WebP 图片。');return}if(f.size>20*1024*1024){api.error('图片需小于 20 MB。');return}const reader=new FileReader();reader.onload=()=>{const check=new Image();check.onload=()=>{const resize=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(check.width,check.height));resize.width=Math.max(1,Math.round(check.width*scale));resize.height=Math.max(1,Math.round(check.height*scale));resize.getContext('2d').drawImage(check,0,0,resize.width,resize.height);setSource(resize.toDataURL('image/png'));setView('生成作品');api.success('照片已载入，开始你的视觉实验。')};check.onerror=()=>api.error('图片文件损坏或格式不受支持。');check.src=reader.result};reader.onerror=()=>api.error('文件读取失败，请重试。');reader.readAsDataURL(f);file.current.value=''}
function download(){if(!img)return;const a=document.createElement('a'),w=qualityWidth(quality,img);let url;if(format==='svg')url=URL.createObjectURL(new Blob([renderArtwork(img,p,null,true,w)],{type:'image/svg+xml'}));else{const out=document.createElement('canvas');renderArtwork(img,p,out,false,w);url=out.toDataURL('image/png')}a.href=url;a.download='Fill-E-'+Date.now()+'.'+format;a.click();if(format==='svg')setTimeout(()=>URL.revokeObjectURL(url),2000);api.success('作品已导出 · '+(format.toUpperCase())+' '+w+'px · 质量'+qualityLabel[quality])}
const fieldLabel=(icon,text)=>h('span',{className:'field-label'},h(Icon,{name:icon,size:12}),text);
const slider=(key,label,icon,min,max,suffix='',help=null)=>h('div',{className:'field'},h('div',{className:'field-head'},fieldLabel(icon,label),h('span',{className:'field-value'},p[key]+suffix)),h(Slider,{min,max,value:p[key],onChange:v=>update(key,v),'aria-label':label}),help&&h('div',{className:'field-help'},help));
const section=(label,icon,...children)=>h('div',{className:'control-section'},h('div',{className:'section-label'},h(Icon,{name:icon,size:12}),label),...children);
const openGuide=()=>antd.Modal.info({
  title:'从照片到字母视觉',
  content:h('div',{className:'guide'},
    h('p',null,'1. 上传 JPG、PNG 或 WebP 照片，也可以直接用内置示例。'),
    h('p',null,'2. 字母与细节：明暗自动映射为字母 E 的笔画粗细，用密度、清晰度、粗细决定保留多少细节。'),
    h('p',null,'3. 波纹与方向：开启波纹让排列产生流动感，可调方向、幅度、频率与字母朝向。'),
    h('p',null,'4. 色彩表达：设定字母与背景颜色，或直接套用预设配色，也可反转明暗。'),
    h('p',null,'5. 导出：选择质量（低 800px / 中 1200px / 高为原图尺寸）与格式（PNG 或可无限缩放的 SVG）。'),
    h('p',{className:'guide-note'},'所有图像处理均在你的浏览器内完成，照片不会上传到任何服务器。')
  ),
  okText:'开始创作'
});

const preview=h('section',{className:'preview-panel'},
  h('div',{className:'panel-head'},
    h('div',{className:'panel-title'},h(Icon,{name:'aperture',size:14}),'作品预览'),
    h(Segmented,{options:['生成作品','原始图片'],value:view,onChange:setView})
  ),
  h('div',{className:'canvas-area'},
    h('div',{className:'art-wrap',ref:wrap},
      h('canvas',{ref:canvas,'aria-label':view+'：由不同粗细的 E 构成的图像',role:'img'})
    )
  ),
  h('div',{className:'preview-foot'},
    h('span',null,h(Icon,{name:'maximize-2',size:12,style:{marginRight:5,verticalAlign:-2}}),info.W+' × '+info.H+' px',
      h('span',{style:{marginLeft:16}},h(Icon,{name:'type',size:12,style:{marginRight:5,verticalAlign:-2}}),info.count.toLocaleString()+' 个字母 E')
    ),
    h('div',null,h('span',{className:'dot'}),'实时渲染')
  )
);

const presetCards=h('section',{className:'presets'},
  h('div',{className:'preset-head'},h('span',{className:'preset-title'},h(Icon,{name:'sparkles',size:13}),'从一种灵感开始')),
  h('div',{className:'preset-grid'},...presets.map((item,i)=>
    h('button',{
      key:i,className:'preset-card '+(preset===i?'active':''),
      onClick:()=>{setP({...item.values});setPreset(i);setView('生成作品')}
    },
      h('span',{className:'preset-art',style:{color:item.colors[0],background:item.colors[1]}},'EEEEEE\nEEEEEE\nEEEEEE\nEEEEEE\nEEEEEE'),
      h('span',{className:'preset-info'},h('b',null,item.name),h('small',null,item.sub)),
      h(Icon,{name:'chevron-right',size:13,className:'preset-arrow'})
    )
  ))
);

const sourceControls=section('01 / 图像来源','image',
  h('input',{ref:file,type:'file',accept:'image/jpeg,image/png,image/webp',style:{display:'none'},onChange:e=>upload(e.target.files[0])}),
  h('button',{
    className:'upload-box',style:{width:'100%'},onClick:()=>file.current.click(),
    onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();upload(e.dataTransfer.files[0])}
  },
    h('span',{className:'upload-icon'},h(Icon,{name:'upload',size:22})),
    h('span',{className:'upload-title'},'上传照片 / 拖拽至此'),
    h('div',{className:'upload-hint'},'JPG、PNG、WebP · 最大 20 MB')
  ),
  h('div',{className:'file-row'},
    h('img',{className:'thumb',src:source,alt:'来源缩略图'}),
    h(Tooltip,{title:'使用内置示例'},
      h(Button,{size:'small',type:'text','aria-label':'使用内置示例',onClick:()=>setSource(sample)},h(Icon,{name:'history',size:14}))
    )
  )
);

const letterControls=section('02 / 字母与细节','type',
  slider('density','字母密度','grid-3x3',30,150,'','越密集，越能保留照片中的细节'),
  slider('clarity','内容清晰度','focus',0,100,'%'),
  slider('weight','笔画粗细','bold',20,120,'%'),
  h('div',{className:'field'},
    h('div',{className:'field-head'},fieldLabel('eraser','背景留白'),h(Switch,{'aria-label':'背景留白',size:'small',checked:p.omitBackground,onChange:v=>update('omitBackground',v)})),
    h('div',{className:'field-help'},'识别边缘相连的相似色背景，留白区域不放置 E。')
  ),
  p.omitBackground&&slider('backgroundStrength','留白强度','contrast',0,100,'%','越高，留白范围越大；适合纯色、天空等简单背景。')
);

const waveControls=section('03 / 波纹与方向','waves',
  h('div',{className:'field'},
    h('div',{className:'field-head'},fieldLabel('zap','启用波纹'),h(Switch,{size:'small','aria-label':'启用波纹',checked:p.wave,onChange:v=>update('wave',v)})),
    h('div',{className:'field-help'},'开启后可调节波纹方向、幅度与频率。')
  ),
  ...(p.wave?[
    h('div',{className:'field'},
      h('div',{className:'field-head'},fieldLabel('compass','波纹方向')),
      h(Segmented,{block:true,options:[
        {label:h('span',{className:'seg-label'},h(Icon,{name:'move-horizontal',size:13}),'横向'),value:'horizontal'},
        {label:h('span',{className:'seg-label'},h(Icon,{name:'move-vertical',size:13}),'纵向'),value:'vertical'},
        {label:h('span',{className:'seg-label'},h(Icon,{name:'move-diagonal',size:13}),'斜向'),value:'diagonal'}
      ],value:p.direction,onChange:v=>update('direction',v)})
    ),
    slider('amplitude','波纹幅度','arrow-up-down',0,60),slider('frequency','波纹频率','activity',0,100),
    h('div',{className:'field'},
      h('div',{className:'field-head'},fieldLabel('rotate-cw','字母朝向')),
      h(Select,{value:p.angle,onChange:v=>update('angle',v),options:[{label:'E / 0°',value:0},{label:'旋转 90°',value:90},{label:'旋转 180°',value:180},{label:'旋转 270°',value:270}]})
    )
  ]:[])
);

const colorControls=section('04 / 色彩表达','palette',
  h('div',{className:'color-row'},...[
    ['fg','type','字母颜色'],['bg','square','背景颜色']
  ].map(([key,icon,label])=>
    h('div',{className:'color-field',key:key},fieldLabel(icon,label),
      h('div',{className:'swatch-label'},h(ColorPicker,{value:p[key],disabledAlpha:true,onChange:c=>update(key,c.toHexString())}),p[key].toUpperCase())
    )
  )),
  h('div',{className:'palette'},...[
    ['#26351e','#f3f5df'],['#161616','#ffffff'],['#2143dc','#eaf0ff'],['#f56935','#2b2423'],['#cfafe7','#2e1744']
  ].map(([fg,bg],i)=>h('button',{
    key:i,'aria-label':'配色 '+(i+1),title:'配色 '+(i+1),style:{background:'linear-gradient(90deg,'+fg+' 50%,'+bg+' 50%)'},
    onClick:()=>{setP(old=>({...old,fg,bg}));setPreset(-1)}
  }))),
  h('div',{className:'field-head',style:{marginTop:16,marginBottom:0}},fieldLabel('flip-horizontal-2','反转明暗'),h(Switch,{size:'small','aria-label':'反转明暗',checked:p.invert,onChange:v=>update('invert',v)}))
);

const exportControls=h('div',{className:'export'},
  h('div',{className:'field-head',style:{marginTop:0,marginBottom:8}},fieldLabel('gauge','导出质量'),
    h('span',{className:'field-value'},img?qualityWidth(quality,img)+' px':'—')),
  h(Segmented,{block:true,'aria-label':'导出质量',className:'quality-seg',value:quality,onChange:setQuality,options:[
    {label:h('span',{className:'seg-label'},h(Icon,{name:'chevrons-down',size:13}),'低'),value:'low'},
    {label:h('span',{className:'seg-label'},h(Icon,{name:'equal',size:13}),'中'),value:'medium'},
    {label:h('span',{className:'seg-label'},h(Icon,{name:'chevrons-up',size:13}),'高'),value:'high'}
  ]}),
  h('div',{style:{display:'flex',gap:8,marginTop:14}},
    h(Select,{'aria-label':'导出格式',value:format,onChange:setFormat,style:{width:96},options:[
      {label:h('span',{className:'seg-label'},h(Icon,{name:'file-image',size:13}),'PNG'),value:'png'},
      {label:h('span',{className:'seg-label'},h(Icon,{name:'file-code',size:13}),'SVG'),value:'svg'}
    ]}),
    h(Button,{type:'primary',style:{flex:1,background:'#d8f77c',color:'#2c371a',borderColor:'#d8f77c'},onClick:download,disabled:!img},
      h(Icon,{name:'download',size:14,style:{marginRight:6,verticalAlign:-2}}),'导出作品'
    )
  )
);

const controls=h('aside',{className:'controls'},
  h('div',{className:'controls-title'},h('span',{className:'controls-title-main'},h(Icon,{name:'sliders-horizontal',size:14}),'创作面板'),
    h(Button,{size:'small',onClick:()=>{setP({...defaults});setPreset(0);setView('生成作品');api.success('参数已重置')}},
      h(Icon,{name:'rotate-ccw',size:13,style:{marginRight:4,verticalAlign:-2}}),'重置'
    )
  ),
  sourceControls,letterControls,waveControls,colorControls,exportControls
);

return h(ConfigProvider,{theme:{
  token:{colorPrimary:'#748b47',borderRadius:6,fontFamily:'"Noto Sans SC","Microsoft YaHei",sans-serif',colorText:'#32382b',controlHeight:34},
  components:{Button:{primaryShadow:'none'},Segmented:{itemSelectedBg:'#fff',trackBg:'#f2f4ef'}}
}},holder,
  h('main',{className:'main'},
    h('div',{className:'intro'},
      h('div',null,h('h1',null,'让每一张照片，有新的秩序。'),h('p',null,'从明暗到笔画，从影像到字母。用 E 探索你的视觉语言。')),
      h(Button,{onClick:openGuide},'使用指南',h(Icon,{name:'square-arrow-out-up-right',size:13,style:{marginLeft:5,verticalAlign:-2}}))
    ),
    h('div',{className:'workspace'},h('div',{className:'preview-column'},preview,presetCards),controls)
  )
);
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
