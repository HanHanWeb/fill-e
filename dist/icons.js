(function () {
/* global lucide, React */
// 桥接 Lucide UMD（原始图标节点）与 React，用法：h(Icon,{name:'upload',size:16})
const h=React.createElement;

const toPascal=str=>String(str).split(/[-_\s]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join('');

const cache=new Map();
const resolve=name=>{
  if(!name)return null;
  const key=toPascal(name);
  if(cache.has(key))return cache.get(key);
  const node=lucide.icons[key]||lucide.icons[name]||null;
  cache.set(key,node);
  return node;
};

const base=props=>{
  const {name,size=24,strokeWidth=2,color='currentColor',className='',style,children,...rest}=props;
  const node=resolve(name);
  if(!node)return null;
  return h('svg',{
    xmlns:'http://www.w3.org/2000/svg',width:size,height:size,viewBox:'0 0 24 24',
    fill:'none',stroke:color,strokeWidth,strokeLinecap:'round',strokeLinejoin:'round',
    className:className?`lucide ${className}`:'lucide',style,...rest
  },node.map(([tag,attrs],i)=>h(tag,{key:i,...attrs})),children);
};

window.Icon=props=>base(props);
})();
