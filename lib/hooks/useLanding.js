'use client';
import { useEffect } from 'react';

export function useLanding() {
  useEffect(() => {
    const menu=document.querySelector('.menu');
    const navigation=document.getElementById('navigation');
    function closeMenu(){navigation.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}
    menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');navigation.classList.toggle('open',open);});
    navigation.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
    window.matchMedia('(min-width:801px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
    const hero=document.querySelector('.hero');
    const slides=[...document.querySelectorAll('.slide')];
    const slideTabs=[...document.querySelectorAll('.slide-tab')];
    const pauseButton=document.querySelector('.pause');
    let currentSlide=0, userPaused=false, timer=null, touchStart=null;
    function renderSlide(index,announce=false){
     currentSlide=(index+slides.length)%slides.length;
     slides.forEach((slide,i)=>{const active=i===currentSlide;slide.classList.toggle('active',active);slide.setAttribute('aria-hidden',String(!active));slide.inert=!active;slideTabs[i].setAttribute('aria-current',String(active));});
     if(announce)document.querySelector('.slide-status').textContent='Banner '+(currentSlide+1)+' of 3: '+slideTabs[currentSlide].querySelector('strong').textContent;
    }
    function updatePause(){pauseButton.setAttribute('aria-pressed',String(userPaused));pauseButton.setAttribute('aria-label',userPaused?'Play automatic banners':'Pause automatic banners');pauseButton.querySelector('span').textContent=userPaused?'▷':'Ⅱ';}
    function schedule(){clearInterval(timer);timer=null;if(!userPaused&&!document.hidden){timer=setInterval(()=>{if(!slides[currentSlide].contains(document.activeElement))renderSlide(currentSlide+1);},5000);}}
    function manualSlide(index){renderSlide(index,true);schedule();}
    slideTabs.forEach((tab,i)=>tab.addEventListener('click',()=>manualSlide(i)));
    document.querySelector('.prev').addEventListener('click',()=>manualSlide(currentSlide-1));
    document.querySelector('.next').addEventListener('click',()=>manualSlide(currentSlide+1));
    pauseButton.addEventListener('click',()=>{userPaused=!userPaused;updatePause();schedule();});
    hero.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();manualSlide(currentSlide+1);slideTabs[currentSlide].focus();}else if(e.key==='ArrowLeft'){e.preventDefault();manualSlide(currentSlide-1);slideTabs[currentSlide].focus();}});
    hero.addEventListener('touchstart',e=>{touchStart={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};},{passive:true});
    hero.addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4)manualSlide(currentSlide+(dx<0?1:-1));touchStart=null;},{passive:true});
    document.addEventListener('visibilitychange',schedule);
    updatePause();schedule();
    const journey=[
    ['The beginning','A little beginning.','A new chapter begins. Stay connected to your clinic from the very start.'],
    ['Early pregnancy','Little moments of wonder.','Follow your clinic’s early care plan, with timely reminders and visual updates.'],
    ['Your first chapter','One milestone at a time.','Keep your next checkup and scheduled tests close at hand.'],
    ['A growing connection','A journey to cherish.','Discover the next visual update, with guidance shared by your care team.'],
    ['Along the way','More reasons to connect.','Make space for your questions and keep in touch with your maternity clinic.'],
    ['Care that continues','Growing, together.','Stay connected to clinic-approved nutrition, wellbeing, and care reminders.'],
    ['The next chapter','Every day, a little closer.','Let your care timeline help you keep track of upcoming visits and tests.'],
    ['Looking ahead','Preparing with care.','Stay informed with the next steps and appointments your clinic recommends.'],
    ['A new beginning ahead','Closer to hello.','Keep your care team close as you prepare for birth and the postnatal journey.']
    ];
    const monthButtons=[...document.querySelectorAll('.month')];
    monthButtons.forEach(button=>button.addEventListener('click',()=>{const month=Number(button.dataset.month);const item=journey[month-1];monthButtons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const img=document.getElementById('journey-image');img.src=button.querySelector('img').src;img.alt='Illustration from the banner for month '+month;document.getElementById('journey-stage').textContent='Month '+month+' · '+item[0];document.getElementById('journey-title').textContent=item[1];document.getElementById('journey-description').textContent=item[2];}));
    document.getElementById('year').textContent=new Date().getFullYear();

    return () => {
      clearInterval(timer);
    };
  }, []);
}
