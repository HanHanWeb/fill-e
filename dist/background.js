// 从边缘主色估计背景，仅保留与边缘连通的低细节区域（连通性保护内部区域）。
function detectBackground(pixels,width,height,strength){
  const count=width*height,mask=new Uint8Array(count),border=[];
  const rgb=i=>[pixels[i*4],pixels[i*4+1],pixels[i*4+2]];
  for(let x=0;x<width;x++){border.push(x);if(height>1)border.push((height-1)*width+x)}
  for(let y=1;y<height-1;y++){border.push(y*width);if(width>1)border.push(y*width+width-1)}
  if(!border.length)return mask;
  const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  const colors=border.map(rgb),centers=[colors[0].slice()];
  while(centers.length<Math.min(5,colors.length)){
    let best=0,far=-1;colors.forEach((c,i)=>{const d=Math.min(...centers.map(k=>distance(c,k)));if(d>far){far=d;best=i}});
    if(far<400)break;centers.push(colors[best].slice());
  }
  let groups=[];
  for(let iteration=0;iteration<6;iteration++){
    groups=centers.map(()=>[]);
    colors.forEach(c=>{let best=0;centers.forEach((k,i)=>{if(distance(c,k)<distance(c,centers[best]))best=i});groups[best].push(c)});
    centers.forEach((k,i)=>{if(groups[i].length)for(let c=0;c<3;c++)k[c]=groups[i].reduce((sum,v)=>sum+v[c],0)/groups[i].length});
  }
  const ranked=centers.map((color,i)=>({color,size:groups[i].length})).sort((a,b)=>b.size-a.size);
  // 只取占比最高的边缘色簇，避免前景色被误判为背景。
  const palette=[ranked[0].color];
  const tolerance=12+Math.max(0,Math.min(100,strength))*.9,threshold=tolerance*tolerance*3;
  // 内容色保护：泛洪会顺着柔和的抗锯齿边缘渗入大片浅色图形（浅色 Logo 被整体省略）。
  // 对容差内的像素按颜色分桶，占比≥1.5% 且与背景明显不同的桶视为内容色，这些颜色的格子一律不省略。
  const Q=8,bins=new Map();
  for(let i=0;i<count;i++){
    const c=rgb(i);
    if(distance(c,palette[0])>threshold)continue;
    const key=((c[0]/Q)|0)+','+((c[1]/Q)|0)+','+((c[2]/Q)|0);
    let b=bins.get(key);
    if(!b){b={n:0,r:0,g:0,b:0};bins.set(key,b)}
    b.n++;b.r+=c[0];b.g+=c[1];b.b+=c[2];
  }
  const guards=[];
  for(const b of bins.values()){
    if(b.n<count*.015)continue;
    const k=[b.r/b.n,b.g/b.n,b.b/b.n];
    if(distance(k,palette[0])>900)guards.push(k);
  }
  const eligible=new Uint8Array(count);
  for(let i=0;i<count;i++){
    const c=rgb(i);const dBg=Math.min(...palette.map(k=>distance(c,k)));
    if(dBg>threshold)continue;
    let guarded=false;
    for(const k of guards)if(distance(c,k)<dBg){guarded=true;break}
    if(guarded)continue;
    const x=i%width,y=Math.floor(i/width);let detail=0,n=0;
    for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])if(j>=0){detail+=Math.sqrt(distance(c,rgb(j))/3);n++}
    if(detail/Math.max(1,n)<14+strength*.35)eligible[i]=1;
  }
  const queue=new Int32Array(count);let head=0,tail=0;
  for(const i of border)if(eligible[i]&&!mask[i]){mask[i]=1;queue[tail++]=i}
  while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);
    for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])if(j>=0&&eligible[j]&&!mask[j]){mask[j]=1;queue[tail++]=j}
  }
  return mask;
}
