
import { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { clearToken, getToken, exchangeMobileCode, getHuperaResource, postHuperaAction } from './huperaApi';
import {
  Activity, ArrowUpRight, Bell, Bot, CalendarCheck, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, CreditCard,
  Download, Home, MapPin, MessageCircle, Plus, Search, Send, Settings,
  ShieldCheck, SlidersHorizontal, Stethoscope, TrendingDown, TrendingUp,
  UserRound, Wallet, X, RefreshCw, Users, FileText, Sun, Moon, LogOut
} from 'lucide-react';
import './styles.css';

type Tab = 'Home'|'Inbox'|'Appointment'|'Reports'|'Settings';
type Msg = {from:'customer'|'ai'|'human'|'system';text:string;time:string};
type Chat = {id:string;conversationId:string;bookingId?:string;name:string;phone:string;channel:string;handlingMode:string;needsAction:boolean;priorityType?:string;unreadCount:number;appointments:any[];payments:any[];initials:string;status:string;time:string;preview:string;department:string;doctor:string;date:string;day:string;slot:string;format:string;amount:number;payment:string;upi:string;transactionId?:string;messages:Msg[]};
type Block = {id:number;department:string;doctors:string[];from:string;to:string;fee:number};
type Day = {name:string;enabled:boolean;blocks:Block[]};

const initialChats:Chat[]=[];

const mk=(id:number,department:string,doctors:string[],from:string,to:string,fee=500):Block=>({id,department,doctors,from,to,fee});

const initialDays:Day[]=[
{name:'Monday',enabled:true,blocks:[mk(1,'Anaesthesiology',['Dr. Aarav Malhotra','Dr. Aditi Saxena'],'09:00 AM','01:00 PM')]},
{name:'Tuesday',enabled:true,blocks:[mk(2,'Nephrology',['Dr. Dev Malhotra','Dr. Diya Mukherjee'],'09:00 AM','01:00 PM'),mk(3,'Radiology',['Dr. Ankur Bahl','Dr. Arvind Kumar Khurana'],'02:00 PM','05:00 PM')]},
{name:'Wednesday',enabled:true,blocks:[mk(4,'Gastroenterology and Gastrointestinal Surgery',['Dr. Nisha Iyer','Dr. Pooja Menon'],'09:00 AM','01:00 PM'),mk(5,'Internal Medicine',['Dr. Sneha Pillai','Dr. Tanvi Shah'],'02:00 PM','05:00 PM')]},
{name:'Thursday',enabled:true,blocks:[mk(6,'Urology',['Dr. Vihaan Khanna','Dr. Yash Agarwal'],'09:00 AM','01:00 PM'),mk(7,'Paediatrics',['Dr. Ananya Desai','Dr. Anil Kumar Anand'],'02:00 PM','05:00 PM')]},
{name:'Friday',enabled:true,blocks:[mk(8,'Neurology and Neurosurgery',['Dr. Balkar Singh','Dr. Biswajyoti Hazarika'],'09:00 AM','01:00 PM',1000),mk(9,'Obstetrics and Gynaecology',['Dr. Manav Gupta','Dr. Meera Nair'],'02:00 PM','05:00 PM')]},
{name:'Saturday',enabled:true,blocks:[mk(10,'Neurology and Neurosurgery',['Dr. Aarav Malhotra','Dr. Aditi Saxena'],'09:00 AM','01:00 PM',1000),mk(11,'Obstetrics and Gynaecology',['Dr. Pooja Menon','Dr. Priya Nambiar'],'02:00 PM','05:00 PM')]},
{name:'Sunday',enabled:false,blocks:[]}
];

const departments=['Anaesthesiology','Cardiology','Nephrology','Radiology','Gastroenterology and Gastrointestinal Surgery','Internal Medicine','Urology','Paediatrics','Neurology and Neurosurgery','Obstetrics and Gynaecology','General Medicine','Orthopaedics','Dermatology'];

const doctors=['Dr. Aarav Malhotra','Dr. Aditi Saxena','Dr. Dev Malhotra','Dr. Diya Mukherjee','Dr. Ankur Bahl','Dr. Arvind Kumar Khurana','Dr. Nisha Iyer','Dr. Pooja Menon','Dr. Sneha Pillai','Dr. Tanvi Shah','Dr. Vihaan Khanna','Dr. Yash Agarwal','Dr. Ananya Desai','Dr. Anil Kumar Anand','Dr. Balkar Singh','Dr. Biswajyoti Hazarika','Dr. Manav Gupta','Dr. Meera Nair','Dr. Priya Nambiar','Dr. Arvind Mehta'];

function Trend({down=false}:{down?:boolean}) {
  return <svg className={'trend '+(down?'down':'')} viewBox="0 0 72 28"><polyline points={down?'0,5 12,9 24,7 36,16 48,13 60,21 72,24':'0,23 12,18 24,20 36,11 48,14 60,6 72,2'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d={down?'M0 5 L12 9 L24 7 L36 16 L48 13 L60 21 L72 24 L72 28 L0 28Z':'M0 23 L12 18 L24 20 L36 11 L48 14 L60 6 L72 2 L72 28 L0 28Z'} fill="currentColor" opacity=".1"/></svg>;
}

function Metric({icon:Icon,label,value,change,detail,down=false}:{icon:any;label:string;value:string;change:string;detail:string;down?:boolean}) {
  return <div className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon size={18}/></span><span className={'metric-change '+(down?'negative':'positive')}>{down?<TrendingDown size={13}/>:<TrendingUp size={13}/>} {change}</span></div><strong className="metric-value">{value}</strong><b className="metric-label">{label}</b><div className="metric-foot"><small>{detail}</small><Trend down={down}/></div></div>;
}

function Fact({icon,label,value}:{icon:any;label:string;value:string}) {
  return <div className="fact"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;
}

function WorkspaceApp() {
  const [tab,setTab]=useState<Tab>('Home');
  const [chats,setChats]=useState<Chat[]>(initialChats);
  const [selected,setSelected]=useState('');
  const [workspace,setWorkspace]=useState<any>({dashboard:null,employees:[],appointments:[],reports:null});
  const [dataLoading,setDataLoading]=useState(true);
  const [dataError,setDataError]=useState('');
  const [search,setSearch]=useState('');
  const [reply,setReply]=useState('');
  const [alertsEnabled,setAlertsEnabled]=useState(false);
  const priorityInitialized=useRef(false);
  const previousPriorityIds=useRef<Set<string>>(new Set());
  const [toast,setToast]=useState('');
  const [days,setDays]=useState(initialDays);
  const [slot,setSlot]=useState('30');
  const [buffer,setBuffer]=useState('15');
  const [service,setService]=useState('Hospital Consultation');
  const [format,setFormat]=useState('Phone / WhatsApp consultation');
  const [location,setLocation]=useState('Near Vastral Metro Station Ahmedabad');
  const [phone,setPhone]=useState('6264324981');
  const [email,setEmail]=useState('aryachandrabhan145@gmail.com');
  const [showPreview,setShowPreview]=useState(false);
  const [period,setPeriod]=useState('7 days');
  const [settings,setSettings]=useState('Business profile');

  // Theme preference is saved on this device/browser.
  const [theme,setTheme]=useState<'light'|'dark'>(() => {
    try {
      return localStorage.getItem('hupera-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const active=chats.find(c=>c.id===selected)||chats[0]||{id:'',conversationId:'',name:'Select a conversation',phone:'',channel:'whatsapp',handlingMode:'AI',needsAction:false,priorityType:undefined,unreadCount:0,appointments:[],payments:[],initials:'?',status:'No conversation selected',time:'',preview:'',department:'—',doctor:'—',date:'—',day:'',slot:'—',format:'—',amount:0,payment:'—',upi:'',messages:[]};
  const human=String(active.handlingMode||'AI').toLowerCase()==='human';
  const filtered=useMemo(()=>chats.filter(c=>(c.name+' '+c.preview+' '+c.department+' '+c.upi+' '+c.status).toLowerCase().includes(search.toLowerCase())),[chats,search]);

  const notify=(s:string)=>{
    setToast(s);
    window.setTimeout(()=>setToast(''),2600);
  };

  const toggleTheme=()=>{
    const next=theme==='light'?'dark':'light';
    setTheme(next);
    try {
      localStorage.setItem('hupera-theme',next);
    } catch {
      // Theme still works for the current session if storage is unavailable.
    }
  };

  const handleLogout=()=>{
  window.dispatchEvent(new Event('hupera-logout'));
};


  const refreshWorkspace=async()=>{
    setDataLoading(true);setDataError('');
    try{
      const [dashboard,employees,appointments,inbox,reports]=await Promise.all([
        getHuperaResource<any>('dashboard'),getHuperaResource<any>('employees'),
        getHuperaResource<any>('appointments'),getHuperaResource<any>('inbox'),getHuperaResource<any>('reports',{days:'30'})
      ]);
      const bookings=Array.isArray(appointments.appointments)?appointments.appointments:[];
      const conversations=Array.isArray(inbox.conversations)?inbox.conversations:[];
      const mapped:Chat[]=conversations.map((c:any)=>{
        const b=c.latest_booking||bookings.find((x:any)=>x.conversation_id===c.id)||{};
        const customerName=c.customer_name&&c.customer_name!=='Customer message'?c.customer_name:(b.customer_name||c.customer_phone||'Unknown customer');
        const stamp=b.starts_at?new Date(b.starts_at):null;
        const validDate=stamp&&!Number.isNaN(stamp.getTime())?stamp:null;
        return {id:String(c.id),conversationId:String(c.id),bookingId:b.id?String(b.id):undefined,
          name:customerName,phone:String(c.customer_phone||b.customer_phone||''),channel:String(c.channel||'whatsapp'),handlingMode:String(c.handling_mode||'AI'),needsAction:c.needs_action===true,priorityType:c.priority_type?String(c.priority_type):undefined,unreadCount:Number(c.unread_count||0),appointments:[],payments:[],initials:customerName.split(/\\s+/).slice(0,2).map((x:string)=>x[0]||'').join('').toUpperCase(),
          status:String(b.status||c.status||'Open').replace(/_/g,' '),
          time:c.last_message_at?new Date(c.last_message_at).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
          preview:c.last_message||c.subject||'No messages yet',department:b.service_name||b.title||'—',
          doctor:b.resource_name||'—',date:validDate?validDate.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—',
          day:validDate?validDate.toLocaleDateString('en-IN',{weekday:'long'}):'',
          slot:validDate?validDate.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—',
          format:b.location||b.booking_type||'—',amount:Number(b.amount||b.total_amount||0),
          payment:b.payment_status||'—',upi:'',transactionId:b.transaction_reference||undefined,messages:[]};
      });
      setWorkspace({dashboard,employees:employees.employees||[],appointments:bookings,reports});
      setChats(mapped);
      const urgent=new Set(mapped.filter(c=>c.needsAction).map(c=>c.id));
      if(priorityInitialized.current&&alertsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){for(const c of mapped){if(c.needsAction&&!previousPriorityIds.current.has(c.id))new Notification(c.priorityType==='payment_confirmation'?'Payment confirmation needs attention':'New appointment request',{body:c.name+' · '+c.preview,tag:'hupera-'+c.id});}}
      previousPriorityIds.current=urgent;priorityInitialized.current=true;
      if(mapped.length&&!mapped.some(c=>c.id===selected))setSelected(mapped[0].id);
    }catch(e){setDataError(e instanceof Error?e.message:'Unable to load workspace data.');}
    finally{setDataLoading(false);}
  };

  useEffect(()=>{void refreshWorkspace();},[]);

  useEffect(()=>{if(tab!=='Inbox')return;const timer=window.setInterval(()=>{void refreshWorkspace();},5000);return ()=>window.clearInterval(timer);},[tab]);

  useEffect(()=>{
    if(!active.conversationId)return;
    let cancelled=false;
    getHuperaResource<any>('thread',{conversation_id:active.conversationId}).then((data)=>{
      if(cancelled)return;
      const messages=(data.messages||[]).map((m:any)=>({
        from:m.sender_type==='customer'?'customer':(m.sender_type==='human'||m.sender_type==='business')?'human':m.sender_type==='system'?'system':'ai',
        text:String(m.content||''),time:m.created_at?new Date(m.created_at).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit'}):''
      } as Msg));
      setChats(old=>old.map(c=>c.id===active.id?{...c,messages,appointments:Array.isArray(data.appointments)?data.appointments:[],payments:Array.isArray(data.payments)?data.payments:[],handlingMode:String(data.conversation?.handling_mode||c.handlingMode),needsAction:data.conversation?.needs_action===true,unreadCount:Number(data.conversation?.unread_count||0)}:c));
    }).catch(e=>{if(!cancelled)setDataError(e instanceof Error?e.message:'Unable to load conversation.');});
    return ()=>{cancelled=true;};
  },[active.conversationId]);

  const enableAlerts=async()=>{if(typeof Notification==='undefined'){notify('Browser notifications are not supported on this device.');return;}const permission=await Notification.requestPermission();setAlertsEnabled(permission==='granted');notify(permission==='granted'?'Inbox notifications enabled.':'Notification permission was not granted.');};

  const paymentReceived=()=>notify('Payment verification must be confirmed by the connected payment provider webhook.');

  const confirm=async()=>{
    if(!active.bookingId){notify('No linked appointment is available to confirm.');return;}
    try{await postHuperaAction('booking_status',{booking_id:active.bookingId,status:'confirmed'});notify('Appointment confirmed.');await refreshWorkspace();}
    catch(e){notify(e instanceof Error?e.message:'Could not confirm appointment.');}
  };

  const simulatePaid=()=>notify('Payment events must come from the connected WhatsApp workflow; a demo payment cannot be created here.');

  const reschedule=async()=>{
    if(!active.bookingId){notify('No linked appointment is available to reschedule.');return;}
    const v=window.prompt('Enter new date and time (YYYY-MM-DDTHH:mm):');
    if(v){const date=new Date(v);if(Number.isNaN(date.getTime())){notify('Enter a valid date and time.');return;}
      try{await postHuperaAction('booking_reschedule',{booking_id:active.bookingId,starts_at:date.toISOString()});notify('Reschedule submitted.');await refreshWorkspace();}
      catch(e){notify(e instanceof Error?e.message:'Could not reschedule appointment.');}}
  };

  const cancel=async()=>{
    if(!active.bookingId){notify('No linked appointment is available to cancel.');return;}
    if(window.confirm('Cancel this appointment?')){try{await postHuperaAction('booking_status',{booking_id:active.bookingId,status:'cancelled'});notify('Appointment cancelled.');await refreshWorkspace();}
      catch(e){notify(e instanceof Error?e.message:'Could not cancel appointment.');}}
  };

  const updateDay=(i:number,p:Partial<Day>)=>setDays(old=>old.map((d,n)=>n===i?{...d,...p}:d));
  const updateBlock=(di:number,id:number,p:Partial<Block>)=>setDays(old=>old.map((d,i)=>i===di?{...d,blocks:d.blocks.map(b=>b.id===id?{...b,...p}:b)}:d));

  const nav=[['Home',Home],['Inbox',MessageCircle],['Appointment',CalendarDays],['Reports',Activity],['Settings',Settings]] as const;

  return (
    <div className={`app-shell ${theme==='dark'?'dark-theme':''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Bot size={22}/></div><div><b>Hupera <span>AI</span></b><small>CLIENT WORKSPACE</small></div></div>
        <div className="workspace-switch"><div className="hospital-icon"><Stethoscope size={17}/></div><div><b>{workspace.dashboard?.organization?.name||'Hupera Workspace'}</b><small>Business account</small></div><ChevronDown size={15}/></div>
        <div className="nav-label">WORKSPACE</div>
        {nav.map(([n,I])=><button key={n} className={'side-link '+(tab===n?'selected':'')} onClick={()=>{setTab(n);setSearch('')}}><I size={17}/><span>{n}</span>{n==='Inbox'&&chats.length>0&&<i className="nav-count">{chats.length}</i>}</button>)}
        <div className="sidebar-bottom"><i className="online-dot"/> <span>AI workforce operational</span><small>All systems in demo mode</small></div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><Bot size={20}/></div><b>Hupera <span>AI</span></b></div>
          <div className="top-actions">
            <button className="icon-btn" onClick={()=>notify('Demo notifications only.')} aria-label="Notifications"><Bell size={18}/></button>
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme==='light'?'Switch to dark mode':'Switch to light mode'} title={theme==='light'?'Dark mode':'Light mode'}>
              {theme==='light'?<Moon size={19}/>:<Sun size={19}/>}
            </button>
            <button className="outline-button" onClick={handleLogout} title="Authentication must be connected for real logout">
              <LogOut size={16}/> Logout
            </button>
            <div className="profile"><div className="profile-avatar">FA</div><div><b>Fortis Admin</b><small>ADMINISTRATOR</small></div></div>
          </div>
        </header>

        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{workspace.dashboard?.organization?.name||'HUPERA WORKSPACE'} <span>/</span> {tab.toUpperCase()}</div>
              <h1>{tab==='Home'?'Good morning!':tab==='Appointment'?'Availability & hours':tab==='Inbox'?'AI Inbox & WhatsApp Chats':tab==='Reports'?'Reports & analytics':'Settings'}</h1>
              <p>{tab==='Home'?'Here’s what’s happening with your business today.':tab==='Appointment'?'Set timing defaults once, then define one or more working blocks for each day.':tab==='Inbox'?'Complete appointment details, chat history & manual payment verification':tab==='Reports'?'Track appointments, revenue, customers and AI performance.':'Manage your hospital workspace and connected services.'}</p>
            </div>
            {tab==='Home'&&<button className="date-chip"><CalendarDays size={15}/> Today, Nov 15, 2026 <ChevronDown size={14}/></button>}
          </div>

          <div className="demo-strip"><span className="demo-indicator"/><div><b>{dataLoading?'Loading workspace':'Live workspace data'}</b><span>{dataError||'Showing information from your signed-in Hupera organization.'}</span></div><button className="outline-button" onClick={()=>void refreshWorkspace()} disabled={dataLoading}>Refresh</button></div>

          {tab==='Home'&&<>
            <div className="section-title"><h2>Today at a glance</h2><button onClick={()=>setTab('Reports')}>View reports <ArrowUpRight size={14}/></button></div>
            <div className="stats-grid">
              <Metric icon={CalendarDays} label="Today's appointments" value={String(workspace.dashboard?.today_appointments?.total??workspace.dashboard?.today_appointments?.count??0)} change="Live" detail="today"/>
              <Metric icon={Clock3} label="Appointment pending" value={String(workspace.dashboard?.counts?.pending_appointments??0)} change="Live" detail="pending appointments"/>
              <Metric icon={CalendarCheck} label="Requested" value={String(workspace.dashboard?.counts?.appointments??0)} change="Live" detail="total appointments"/>
              <Metric icon={MessageCircle} label="Conversations" value={String(workspace.dashboard?.counts?.conversations??0)} change="Live" detail="conversations"/>
              <Metric icon={Wallet} label="Revenue collected" value={workspace.reports?.currency?new Intl.NumberFormat('en-IN',{style:'currency',currency:workspace.reports.currency,maximumFractionDigits:0}).format(Number(workspace.reports.revenue||0)):String(workspace.reports?.revenue??'—')} change="Live" detail="reported revenue"/>
            </div>
            <div className="home-grid">
              <section className="panel">
                <div className="section-title inside"><h2><Bot size={17}/> Your AI workforce</h2><span className="status-pill">● 3 active</span></div>
                <p className="muted-copy">Your AI team is handling routine work while your staff focuses on patient care.</p>
                {[['Reception Assistant','Appointments & enquiries'],['Customer Support','WhatsApp conversations'],['Follow-up Assistant','Reminders & follow-ups']].map(([a,b])=><div className="agent-row" key={a}><span className="agent-icon"><Bot size={17}/></span><span className="agent-info"><b>{a}</b><small>{b}</small></span><span className="agent-status">● Active</span></div>)}
                <button className="outline-button full" onClick={()=>setTab('Settings')}>Manage AI workforce <ArrowUpRight size={14}/></button>
              </section>
              <section className="panel">
                <div className="section-title inside"><h2>Upcoming appointments</h2><button onClick={()=>setTab('Inbox')}>Open inbox <ChevronRight size={14}/></button></div>
                {(workspace.appointments||[]).filter((b:any)=>b.starts_at&&new Date(b.starts_at).toDateString()===new Date().toDateString()).slice(0,5).map((b:any)=><div className="mini-booking" key={b.id}><span className="avatar violet">{String(b.customer_name||'C').split(' ').map((x:string)=>x[0]).join('').slice(0,2)}</span><span className="mini-booking-info"><b>{b.customer_name||'Customer'}</b><small>{[b.service_name||b.title,b.resource_name].filter(Boolean).join(' · ')||'Appointment'}</small></span><b className="booking-time">{b.starts_at?new Date(b.starts_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</b></div>)}{!dataLoading&&(workspace.appointments||[]).filter((b:any)=>b.starts_at&&new Date(b.starts_at).toDateString()===new Date().toDateString()).length===0&&<p className="muted-copy">No appointments scheduled for today.</p>}
              </section>
            </div>
            <section className="panel activity-panel">
              <div className="section-title inside"><h2>Recent activity</h2><small>Latest workspace updates</small></div>
              {[['Payment needs verification','Priya Sharma · ₹1,200 · UPI','10:42 AM'],['Appointment confirmed','Aman Joshi · Calendar demo sync','Yesterday'],['New appointment request','Anya Pandey · Dermatology','Nov 14']].map(([a,b,c])=><button className="activity-row" key={a} onClick={()=>setTab('Inbox')}><span className="activity-icon"><Activity size={17}/></span><span className="activity-text"><b>{a}</b><small>{b}</small></span><time>{c}</time></button>)}
            </section>
          </>}

          {tab==='Inbox'&&<>
            <div className="inbox-global-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patients, appointments, UPI ID..."/><span className="calendar-sync"><CheckCircle2 size={14}/> Hupera workspace</span></div>
            <section className="inbox-panel">
              <aside className="inbox-list">
                <div className="inbox-list-head"><div><h2>AI Inbox Conversations</h2><small>● Live · auto-refresh every 5 seconds</small></div><button className="outline-button" onClick={enableAlerts}>Enable alerts</button></div>
                <div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer chats..."/></div>
                {filtered.map(c=><button className={'chat-row '+(active.id===c.id?'chosen ':'')+(c.needsAction?'priority-chat':'')} key={c.id} onClick={()=>setSelected(c.id)}><span className="avatar violet">{c.initials}</span><span className="chat-copy"><span className="between"><b>{c.name}</b><small>{c.time}</small></span><p>{c.preview}</p><span className="chat-status">{c.status}</span>{c.needsAction&&<span className="priority-badge">{c.priorityType==='payment_confirmation'?'Payment needs action':'New appointment request'}</span>}</span>{c.unreadCount>0&&<i className="unread-count">{c.unreadCount}</i>}</button>)}
              </aside>
              <section className="chat-detail">
                <div className="chat-detail-head"><span className="avatar violet">{active.initials}</span><span className="chat-person"><b>{active.name}</b><small>{active.channel.toLowerCase().includes('whatsapp')?'WhatsApp':active.channel} · {active.phone||'Phone not available'} · {active.status}</small></span><button className="outline-button" onClick={async()=>{try{await postHuperaAction('conversation_mode',{conversation_id:active.conversationId,mode:human?'AI':'Human'});notify(human?'AI Agent resumed for this chat.':'You have taken over this chat. AI replies are paused.');setChats(old=>old.map(c=>c.id===active.id?{...c,handlingMode:human?'AI':'Human',needsAction:false,unreadCount:0}:c));}catch(e){notify(e instanceof Error?e.message:'Could not change conversation mode.');}}}>{human?'Resume AI Agent':'Take Over Chat from AI Agent'}</button></div>
                <div className="appointment-summary">
                  <div className="summary-heading"><div><span className="eyebrow">APPOINTMENT DETAILS</span><h3>{active.name}</h3></div><span className={'status-badge '+(active.status==='Confirmed & Synced'?'ok':active.status==='Payment Paid - Verify'?'warning':'neutral')}>{active.status}</span></div>
                  <div className="appointment-facts">
                    <Fact icon={<Stethoscope/>} label="Department" value={active.department}/>
                    <Fact icon={<UserRound/>} label="Doctor / staff" value={active.doctor}/>
                    <Fact icon={<CalendarDays/>} label="Date & day" value={active.date+' ('+active.day+')'}/>
                    <Fact icon={<Clock3/>} label="Appointment time" value={active.slot}/>
                    <Fact icon={<MapPin/>} label="Visit type" value={active.format}/>
                    <Fact icon={<Wallet/>} label="Consultation fee" value={'₹'+active.amount.toLocaleString('en-IN')}/>
                    <Fact icon={<CreditCard/>} label="Payment choice" value={active.payment}/>
                    {active.transactionId&&<Fact icon={<FileText/>} label="Transaction ID" value={active.transactionId}/>}
                  </div>
                  {active.payment==='Pay Now'&&<div className="upi-strip"><div><small>UPI ID</small><b>{active.upi}</b></div><div><small>Payment amount</small><b>₹{active.amount.toLocaleString('en-IN')}</b></div><div><small>UPI QR</small><b>Generated by payment provider when connected</b></div></div>}
                  <div className="appointment-actions">
                    {active.status==='Payment Paid - Verify'?<button className="primary-button success-button" onClick={paymentReceived}><CheckCircle2 size={16}/> Payment Received</button>:<button className="primary-button" onClick={confirm}><Check size={16}/> Confirm Appt</button>}
                    <button className="outline-button" onClick={reschedule}><RefreshCw size={15}/> Reschedule</button>
                    <button className="danger-button" onClick={cancel}><X size={15}/> Cancel</button>
                  </div>
                </div>
                <div className="chat-history-head"><div><h3>Complete conversation history</h3><small>{active.messages.length} messages · oldest to newest</small></div><span className="mode-pill">{human?'Human takeover active':'AI agent'}</span></div>
                <div className="chat-thread">{(active.appointments||[]).map((b:any)=><div className="appointment-request" key={'appointment-'+b.id}><div className="request-heading"><CalendarCheck size={17}/><b>Appointment {String(b.status||'requested').replace(/_/g,' ')}</b></div><div className="request-details"><span>Service</span><b>{b.service_name||b.title||'Appointment'}</b></div><div className="request-details"><span>Date & time</span><b>{b.starts_at?new Date(b.starts_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Awaiting slot selection'}</b></div><div className="request-details"><span>Assigned person</span><b>{b.resource_name||'Not assigned'}</b></div><div className="request-details"><span>Reference</span><b>{b.reference_code||'—'}</b></div></div>)}{(active.payments||[]).map((p:any)=><div className="appointment-request payment-request-card" key={'payment-'+p.id}><div className="request-heading"><CreditCard size={17}/><b>Payment {String(p.status||'pending').replace(/_/g,' ')}</b></div><div className="request-details"><span>Amount</span><b>{new Intl.NumberFormat('en-IN',{style:'currency',currency:p.currency||'INR'}).format(Number(p.amount||0))}</b></div><div className="request-details"><span>Payment type</span><b>{p.payment_kind||'Appointment payment'}</b></div><div className="request-details"><span>Provider</span><b>{p.provider||'—'}</b></div>{p.payment_link_url&&<p><a href={p.payment_link_url} target="_blank" rel="noreferrer">Open payment link</a></p>}</div>)}{(active.appointments||[]).filter((b:any)=>b.payment_confirmation_requested_at||String(b.payment_status||'').toLowerCase()==='pending').map((b:any)=><div className="appointment-request payment-request-card" key={'payment-request-'+b.id}><div className="request-heading"><CreditCard size={17}/><b>Payment confirmation requested</b></div><div className="request-details"><span>Booking</span><b>{b.reference_code||b.title||'Appointment'}</b></div><div className="request-details"><span>Payment status</span><b>{b.payment_status||'Pending verification'}</b></div><div className="request-details"><span>Reference / UTR</span><b>{b.payment_reference||'Not supplied'}</b></div></div>)}{active.messages.map((m,i)=><div key={i} className={'message-wrap '+m.from}><div className={'message '+(m.from==='customer'?'received':m.from==='system'?'system-message':'sent')}>{m.from!=='customer'&&<small className="sender">{m.from==='ai'?'Hupera AI':m.from==='human'?'Team member':'System update'}</small>}{m.text}<small className="message-time">{m.time}</small></div></div>)}</div>
                <div className="chat-quick-actions"><small>Messages are sent through the connected channel. AI automation is {human?'paused for this chat':'active for this chat'}.</small></div>
                <form className="reply-box" onSubmit={async e=>{e.preventDefault();if(!reply.trim()||!active.conversationId)return;try{await postHuperaAction('reply',{conversation_id:active.conversationId,message:reply.trim()});setReply('');notify('Message sent.');const data=await getHuperaResource<any>('thread',{conversation_id:active.conversationId});const messages=(data.messages||[]).map((m:any)=>({from:m.sender_type==='customer'?'customer':(m.sender_type==='human'||m.sender_type==='business')?'human':m.sender_type==='system'?'system':'ai',text:String(m.content||''),time:m.created_at?new Date(m.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''} as Msg));setChats(old=>old.map(c=>c.id===active.id?{...c,messages}:c));}catch(err){notify(err instanceof Error?err.message:'Message could not be sent.');}}}><input value={reply} onChange={e=>setReply(e.target.value)} placeholder={human?'Type a message as human agent...':'Type a message to customer...'}/><button aria-label="Send message" disabled={!reply.trim()}><Send size={17}/></button></form>
              </section>
            </section>
          </>}

          {tab==='Appointment'&&<AppointmentPage days={days} setDays={setDays} updateDay={updateDay} updateBlock={updateBlock} slot={slot} setSlot={setSlot} buffer={buffer} setBuffer={setBuffer} service={service} setService={setService} format={format} setFormat={setFormat} location={location} setLocation={setLocation} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} showPreview={showPreview} setShowPreview={setShowPreview} notify={notify}/>}
          {tab==='Reports'&&<Reports period={period} setPeriod={setPeriod} reports={workspace.reports}/>}
          {tab==='Settings'&&<SettingsPage section={settings} setSection={setSettings} onLogout={handleLogout}/>}

          <footer className="footer"><span>Hupera AI Client · v0.4.0</span><span><ShieldCheck size={13}/> Secure workspace concept · Demo mode</span></footer>
        </main>
      </div>

      <nav className="mobile-nav">{nav.map(([n,I])=><button key={n} className={tab===n?'active':''} onClick={()=>setTab(n)}><I size={19}/><span>{n}</span></button>)}</nav>
      {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
    </div>
  );
}

function AppointmentPage(p:any) {
  const {days,setDays,updateDay,updateBlock,slot,setSlot,buffer,setBuffer,service,setService,format,setFormat,location,setLocation,phone,setPhone,email,setEmail,showPreview,setShowPreview,notify}=p;
  const [copy,setCopy]=useState<Record<number,string>>({});
  const copyTo=(from:number,to:number)=>{
    setDays((old:Day[])=>old.map((d,i)=>i===to?{...d,enabled:old[from].enabled,blocks:old[from].blocks.map(b=>({...b,id:Date.now()+Math.random(),doctors:[...b.doctors]}))}:d));
    notify(days[from].name+' schedule copied to '+days[to].name+'.');
  };

  return <section className="appointment-page">
    <div className="panel config-panel">
      <div className="section-title inside"><div><h2>Availability defaults</h2><p>Set timing defaults once, then define one or more working blocks for each day.</p></div><span className="status-pill">Asia/Kolkata · UTC+5:30</span></div>
      <div className="settings-grid">
        <label>Default slot duration<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
        <label>Buffer between meetings<select value={buffer} onChange={e=>setBuffer(e.target.value)}><option value="0">No buffer</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select></label>
        <label>Timezone<input value="Asia/Kolkata · UTC+5:30" readOnly/></label>
        <label>Booking / service title<input value={service} onChange={e=>setService(e.target.value)}/></label>
        <label>Meeting format<select value={format} onChange={e=>setFormat(e.target.value)}><option>Phone / WhatsApp consultation</option><option>In-person visit</option><option>Video consultation</option><option>Phone call</option></select></label>
        <label>Location / meeting point<input value={location} onChange={e=>setLocation(e.target.value)}/></label>
        <label>Host phone (+91 India)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 India · enter up to 10 digits"/></label>
        <label>Notification email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      </div>
    </div>

    <div className="section-title schedule-heading"><div><h2>Weekly schedule</h2><p>Switch days on or off. Add separate blocks for lunch breaks or split shifts.</p></div><button className="outline-button" onClick={()=>days.slice(1,6).forEach((_:Day,i:number)=>copyTo(0,i+1))}>Apply Monday’s hours to all weekdays</button></div>

    <div className="schedule-list">{days.map((day:Day,di:number)=><section className={'panel day-card '+(!day.enabled?'day-disabled':'')} key={day.name}>
      <div className="day-head"><div className="day-title"><button className={'toggle '+(day.enabled?'on':'')} onClick={()=>updateDay(di,{enabled:!day.enabled})}><span/></button><div><h3>{day.name}</h3><small>{day.enabled?day.blocks.length+' working block(s)':'Unavailable'}</small></div></div>
        <div className="day-controls">
          <button className="text-button" onClick={()=>updateDay(di,{blocks:[...day.blocks,mk(Date.now(),'Cardiology',['Dr. Arvind Mehta'],'09:00 AM','01:00 PM')]})}><Plus size={15}/> Add time block and assign person</button>
          <select value={copy[di]||''} onChange={e=>{setCopy(v=>({...v,[di]:e.target.value}));if(e.target.value!=='')copyTo(di,Number(e.target.value))}}><option value="">Copy to…</option>{days.map((d:Day,i:number)=>i!==di&&<option key={d.name} value={i}>{d.name}</option>)}</select>
        </div>
      </div>
      {day.enabled&&day.blocks.map((b:Block)=><div className="schedule-block" key={b.id}>
        <div className="block-top"><span className="block-label">WORKING BLOCK</span><button className="plain-icon" onClick={()=>updateDay(di,{blocks:day.blocks.filter(x=>x.id!==b.id)})}><X size={16}/></button></div>
        <div className="block-grid">
          <label className="wide-field">Department<select value={b.department} onChange={e=>updateBlock(di,b.id,{department:e.target.value})}>{departments.map(d=><option key={d}>{d}</option>)}</select></label>
          <div className="wide-field"><span className="field-label">Assign people ({b.doctors.length} selected)</span><div className="doctor-chips">{b.doctors.map(d=><span className="doctor-chip" key={d}>{d}<button onClick={()=>updateBlock(di,b.id,{doctors:b.doctors.filter(x=>x!==d)})}><X size={12}/></button></span>)}</div><select className="add-doctor" value="" onChange={e=>{if(e.target.value&&!b.doctors.includes(e.target.value))updateBlock(di,b.id,{doctors:[...b.doctors,e.target.value]})}}><option value="">+ Assign another person</option>{doctors.filter(d=>!b.doctors.includes(d)).map(d=><option key={d}>{d}</option>)}</select></div>
          <label>From<input type="time" value={time24(b.from)} onChange={e=>updateBlock(di,b.id,{from:time12(e.target.value)})}/></label>
          <label>To<input type="time" value={time24(b.to)} onChange={e=>updateBlock(di,b.id,{to:time12(e.target.value)})}/></label>
          <label>Fee (₹)<input type="number" min="0" value={b.fee} onChange={e=>updateBlock(di,b.id,{fee:Number(e.target.value)})}/></label>
        </div>
      </div>)}
      {day.enabled&&day.blocks.length===0&&<div className="empty-block">No working blocks yet. Add a time block to make this day bookable.</div>}
      {!day.enabled&&<div className="empty-block">This day is switched off and customers cannot book appointments.</div>}
    </section>)}</div>

    <div className="appointment-footer"><button className="outline-button" onClick={()=>setShowPreview(!showPreview)}><CalendarDays size={15}/>{showPreview?'Hide slot preview':'Preview available slots'}</button><button className="primary-button" onClick={()=>notify('Availability saved in this browser demo. Connect backend to publish to website and WhatsApp.')}><Check size={16}/> Save availability</button></div>

    {showPreview&&<section className="panel preview-panel"><h2>Preview available slots</h2><p className="muted-copy">Illustrative slots account for the selected slot duration and buffer.</p>{days.filter((d:Day)=>d.enabled).map((d:Day)=><div className="preview-day" key={d.name}><b>{d.name}</b>{d.blocks.map((b:Block)=><div className="preview-block" key={b.id}><span>{b.department} · {b.doctors.join(', ')}</span><div>{slotsFor(b.from,b.to,Number(slot),Number(buffer)).map(t=><span className="slot-pill" key={t}>{t}</span>)}</div></div>)}</div>)}</section>}
  </section>;
}

function time24(s:string) {
  const [t,a]=s.split(' ');
  let [h,m]=t.split(':').map(Number);
  if(a==='PM'&&h!==12)h+=12;
  if(a==='AM'&&h===12)h=0;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

function time12(s:string) {
  const [hh,mm]=s.split(':').map(Number);
  return String(hh%12||12).padStart(2,'0')+':'+String(mm).padStart(2,'0')+' '+(hh>=12?'PM':'AM');
}

function slotsFor(from:string,to:string,duration:number,buffer:number) {
  const a=time24(from).split(':').map(Number),z=time24(to).split(':').map(Number);
  let t=a[0]*60+a[1],end=z[0]*60+z[1],out:string[]=[];
  while(t+duration<=end&&out.length<14){
    out.push(time12(String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')));
    t+=duration+buffer;
  }
  return out;
}

function Reports({period,setPeriod,reports}:{period:string;setPeriod:(s:string)=>void;reports:any}) {
  return <section className="panel module-panel">
    <div className="toolbar"><div><h2>Performance overview</h2><p>Business performance and trends for the selected period.</p></div><select value={period} onChange={e=>setPeriod(e.target.value)}><option>7 days</option><option>30 days</option><option>90 days</option></select></div>
    <div className="stats-grid report-metrics">
      <Metric icon={CalendarCheck} label="Appointments" value={String(reports?.appointments??0)} change="Live" detail={period}/>
      <Metric icon={Users} label="Customers" value={String(reports?.customers??0)} change="Live" detail={period}/>
      <Metric icon={Wallet} label="Revenue" value={reports?.currency?new Intl.NumberFormat('en-IN',{style:'currency',currency:reports.currency,maximumFractionDigits:0}).format(Number(reports?.revenue||0)):String(reports?.revenue??0)} change="Live" detail={period}/>
      <Metric icon={MessageCircle} label="Conversations" value={String(reports?.conversations??0)} change="Live" detail={period}/>
      <Metric icon={Activity} label="AI responses" value={String(reports?.ai_responses??0)} change="Live" detail="recorded responses"/>
    </div>
    <div className="report-grid">
      <div className="panel-inner"><div className="section-title inside"><div><h3>Weekly activity</h3><p>Activity from your Hupera workspace</p></div><button className="outline-button" onClick={()=>window.alert('Report export will be available after backend connection.')}><Download size={14}/> Export</button></div><div className="bar-chart">{[42,56,49,68,62,86,74].map((v,i)=><div className="bar-column" key={i}><div className="bar-track"><span style={{height:v+'%'}}/></div><small>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small></div>)}</div><div className="chart-legend"><i/> Appointment activity</div></div>
      <div className="panel-inner"><h3>Performance summary</h3>{[['Appointment completion','91%','+4.1%'],['No-show rate','4.8%','-1.3%'],['Payment collection','₹2.48L','+11.6%'],['Average response time','38 sec','-12 sec']].map(([a,b,c])=><div className="summary-line" key={a}><div><small>{a}</small><b>{b}</b></div><span className="positive"><TrendingUp size={13}/>{c}</span></div>)}</div>
    </div>
  </section>;
}

function SettingsPage({section,setSection,onLogout}:{section:string;setSection:(s:string)=>void;onLogout:()=>void}) {
  const items=[['Business profile','Hospital name, address and contact'],['WhatsApp integration','Connect and manage WhatsApp'],['AI Workforce','Agents, instructions and handover'],['Payments','UPI details and payment workflow'],['Team & permissions','Staff access and roles'],['Notifications','Email and WhatsApp alerts'],['Google Calendar','Calendar connection and sync'],['Billing & support','Subscription and help centre']];

  return <section className="panel module-panel">
    <div className="toolbar"><div><h2>Workspace settings</h2><p>Configure your hospital account and integrations.</p></div></div>
    <div className="settings-layout">
      <div className="settings-menu">{items.map(([a,b])=><button className={section===a?'active':''} key={a} onClick={()=>setSection(a)}><span><b>{a}</b><small>{b}</small></span><ChevronRight size={15}/></button>)}</div>
      <div className="settings-detail">
        <div className="settings-detail-icon"><Settings size={20}/></div>
        <h3>{section}</h3>
        <p>Manage {section.toLowerCase()} for Fortis Hospital. These are preview controls until live provider accounts and backend services are connected.</p>
        {section==='Business profile'&&<><label>Business name<input value="Fortis Hospital" readOnly/></label><label>Timezone<input value="Asia/Kolkata" readOnly/></label></>}
        {section==='Payments'&&<><label>UPI ID<input value="huperaclinic@okhdfcbank" readOnly/></label><label>Verification method<input value="Manual verification by hospital admin" readOnly/></label></>}
        {section==='Google Calendar'&&<div className="integration-state"><CalendarCheck/><div><b>Google Calendar not connected</b><small>Authorize a Google account to enable live calendar sync.</small></div></div>}
        <button className="outline-button" onClick={()=>window.alert('This setting needs backend integration.')}>Configure {section}</button>
        <div style={{marginTop:28,paddingTop:20,borderTop:'1px solid var(--settings-divider, #e5eaf1)'}}>
          <h3 style={{marginTop:0}}>Account</h3>
          <p>Logout requires a connected login and authentication service. This preview currently does not contain that connection.</p>
          <button className="danger-button" onClick={onLogout}><LogOut size={16}/> Logout</button>
        </div>
      </div>
    </div>
  </section>;
}



function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const processingCode = useRef(false);
  const callbackSucceeded = useRef(false);

  useEffect(() => {
    let mounted = true;
    let listener: { remove: () => Promise<void> } | null = null;

    const handleAppUrl = async (url: string) => {
      try {
        const callback = new URL(url);

        // Accept only Hupera's Android authentication callback.
        if (
          callback.protocol !== 'hupera:' ||
          callback.hostname !== 'auth'
        ) {
          return;
        }

        const code = callback.searchParams.get('code');
        const callbackError = callback.searchParams.get('error');

        if (callbackError) {
          throw new Error(
            callback.searchParams.get('error_description') ||
            callbackError
          );
        }

        if (!code || processingCode.current) return;

        processingCode.current = true;

        if (mounted) {
          setLoading(true);
          setError('');
        }

        // Exchange the one-time login code for the app session.
        await exchangeMobileCode(code);

        callbackSucceeded.current = true;

        if (mounted) {
          setAuthenticated(true);
          setError('');
        }

        // Close the browser only after successful login.
        try {
          await Browser.close();
        } catch {
          // The browser may already have closed.
        }
      } catch (err) {
        processingCode.current = false;

        if (mounted) {
          setAuthenticated(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Mobile login failed. Please try again.'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const initialize = async () => {
      try {
        // Register the callback listener before checking the launch URL.
        listener = await CapacitorApp.addListener(
          'appUrlOpen',
          ({ url }) => {
            void handleAppUrl(url);
          }
        );

        // Handle the case where Android launches the app directly
        // through hupera://auth?code=...
        const launch = await CapacitorApp.getLaunchUrl();

        if (launch?.url) {
          await handleAppUrl(launch.url);
        }

        // Do not let an old token check overwrite a successful callback.
        if (!callbackSucceeded.current && !processingCode.current) {
          const token = await getToken();

          if (
            mounted &&
            !callbackSucceeded.current &&
            !processingCode.current
          ) {
            setAuthenticated(!!token);
          }
        }
      } catch (err) {
        if (mounted && !callbackSucceeded.current) {
          setAuthenticated(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to check your login session.'
          );
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    };

    const logout = async () => {
      await clearToken();

      processingCode.current = false;
      callbackSucceeded.current = false;

      if (mounted) {
        setAuthenticated(false);
        setError('');
      }
    };

    window.addEventListener('hupera-logout', logout);

    void initialize();

    return () => {
      mounted = false;
      window.removeEventListener('hupera-logout', logout);

      if (listener) {
        void listener.remove();
      }
    };
  }, []);

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await Browser.open({
        url: 'https://hupera-ai.hatchable.site/api/hupera-mobile-sso'
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to open secure login.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#101827',
        color: '#fff',
        fontFamily: 'Arial, sans-serif'
      }}>
        Checking your Hupera AI session...
      </div>
    );
  }

  if (authenticated) {
    return <WorkspaceApp />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      background: '#101827',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: 30,
        borderRadius: 18,
        background: '#1b293c',
        color: '#fff',
        boxSizing: 'border-box',
        border: '1px solid #34445a'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 54,
            height: 54,
            margin: '0 auto 14px',
            borderRadius: 15,
            display: 'grid',
            placeItems: 'center',
            background: '#315be8',
            fontSize: 25,
            fontWeight: 700
          }}>
            H
          </div>

          <h1 style={{ margin: '0 0 8px', fontSize: 27 }}>
            Hupera AI
          </h1>

          <p style={{ color: '#aab8cb', margin: 0 }}>
            Your AI workforce. Always working.
          </p>
        </div>

        <h2 style={{ fontSize: 20 }}>Welcome back</h2>

        <p style={{ color: '#aab8cb', lineHeight: 1.5 }}>
          Sign in securely using your registered Hupera AI account.
          Your website login will open for verification.
        </p>

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: 14,
            border: 0,
            borderRadius: 9,
            background: '#315be8',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Opening secure login...' : 'Sign in with Hupera AI'}
        </button>

        {error && (
          <p style={{
            color: '#ff8585',
            background: '#42232c',
            padding: 12,
            borderRadius: 8,
            fontSize: 14,
            marginTop: 16
          }}>
            {error}
          </p>
        )}

        <p style={{
          textAlign: 'center',
          color: '#8292a9',
          fontSize: 12,
          marginTop: 25
        }}>
          Secure Hupera AI account authentication
        </p>
      </div>
    </div>
  );
}

export default App;
