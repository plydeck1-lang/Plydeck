'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);const[error,setError]=useState('');
 useEffect(()=>{const listener=(e:Event)=>setError((e as CustomEvent<string>).detail);window.addEventListener('plydeck-error',listener);return()=>window.removeEventListener('plydeck-error',listener);},[]);
 useEffect(()=>{const el=ref.current;el?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=before;};},[]);
 return <dialog ref={ref} className={`dialog ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={22}/></button></div><div className="dialog-body">{error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}{children}</div></dialog>;
}
