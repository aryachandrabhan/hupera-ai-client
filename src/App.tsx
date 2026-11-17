
import { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Badge } from '@capawesome/capacitor-badge';
import { Browser } from '@capacitor/browser';
import { clearToken, getToken, exchangeMobileCode, getHuperaResource, postHuperaAction } from './huperaApi';
import {
  Activity, ArrowUpRight, Bell, Bot, CalendarCheck, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, CreditCard,
  Download, Home, MessageCircle, Plus, Search, Send, Settings,
  ShieldCheck, Stethoscope, TrendingDown, TrendingUp,
  Wallet, X, RefreshCw, Users, FileText, Sun, Moon, LogOut
} from 'lucide-react';
import './styles.css';
import { exportReportCsv, exportReportPdf, exportReportPng, type ReportExportSection } from './reportExports';

type Tab = 'Home'|'Inbox'|'Appointment'|'Reports'|'Settings';
type Msg = {id?:string;from:'customer'|'ai'|'human'|'system';text:string;time:string;type?:string;createdAt?:string;metadata?:any};
type Chat = {id:string;conversationId:string;bookingId?:string;name:string;phone:string;channel:string;handlingMode:string;needsAction:boolean;priorityType?:string;unreadCount:number;pendingRequestCount?:number;appointments:any[];payments:any[];initials:string;status:string;time:string;preview:string;department:string;doctor:string;date:string;day:string;slot:string;format:string;amount:number;payment:string;upi:string;transactionId?:string;messages:Msg[]};
type Block = {id:number;department:string;doctors:string[];from:string;to:string;fee:number;resourceId:string;resourceIds?:string[];serviceId:string};
type Day = {name:string;enabled:boolean;blocks:Block[]};

const initialChats:Chat[]=[];

const dayNames=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const initialDays:Day[]=dayNames.map(name=>({name,enabled:false,blocks:[]}));

function Trend({down=false}:{down?:boolean}) {
  return <svg className={'trend '+(down?'down':'')} viewBox="0 0 72 28"><polyline points={down?'0,5 12,9 24,7 36,16 48,13 60,21 72,24':'0,23 12,18 24,20 36,11 48,14 60,6 72,2'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d={down?'M0 5 L12 9 L24 7 L36 16 L48 13 L60 21 L72 24 L72 28 L0 28Z':'M0 23 L12 18 L24 20 L36 11 L48 14 L60 6 L72 2 L72 28 L0 28Z'} fill="currentColor" opacity=".1"/></svg>;
}

function Metric({icon:Icon,label,value,change,detail,down=false}:{icon:any;label:string;value:string;change:string;detail:string;down?:boolean}) {
  return <div className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon size={18}/></span><span className={'metric-change '+(down?'negative':'positive')}>{down?<TrendingDown size={13}/>:<TrendingUp size={13}/>} {change}</span></div><strong className="metric-value">{value}</strong><b className="metric-label">{label}</b><div className="metric-foot"><small>{detail}</small><Trend down={down}/></div></div>;
}

function WorkspaceApp() {
  const [tab,setTab]=useState<Tab>('Home');
  const [chats,setChats]=useState<Chat[]>(initialChats);
  const [selected,setSelected]=useState('');
  const [mobileChatOpen,setMobileChatOpen]=useState(false);
  const [workspace,setWorkspace]=useState<any>({dashboard:null,employees:[],appointments:[],reports:null});
  const [dataLoading,setDataLoading]=useState(true);
  const [dataError,setDataError]=useState('');
  const [unreadNotifications,setUnreadNotifications]=useState(0);
  const [notifications,setNotifications]=useState<any[]>([]);
  const [showNotifications,setShowNotifications]=useState(false);
  const [alertsEnabled,setAlertsEnabled]=useState(false);
  const [pushPermission,setPushPermission]=useState('unknown');
  const [search,setSearch]=useState('');
  const [reply,setReply]=useState('');
  const alertAudio=useRef<AudioContext|null>(null);
  const pushTokenRef=useRef('');
  const priorityInitialized=useRef(false);
  const workspaceSyncBusy=useRef(false);
  const threadSyncBusy=useRef(false);
  const previousPriorityIds=useRef<Set<string>>(new Set());
  const [toast,setToast]=useState('');
  const [days,setDays]=useState(initialDays);
  const [availabilityItems,setAvailabilityItems]=useState<any[]>([]);
  const [settingsData,setSettingsData]=useState<any>(null);
  const [settingsSaving,setSettingsSaving]=useState(false);
  const [timezone,setTimezone]=useState('Asia/Kolkata');
  const [slot,setSlot]=useState('30');
  const [buffer,setBuffer]=useState('15');
  const [service,setService]=useState('');
  const [format,setFormat]=useState('Phone / WhatsApp consultation');
  const [location,setLocation]=useState('');
  const [phone,setPhone]=useState('');
  const [email,setEmail]=useState('');
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
  const pendingReviewCount=chats.reduce((total:any,chat:any)=>total+Math.max(Number(chat.unreadCount||0),Number(chat.pendingRequestCount||0),chat.needsAction?1:0),0);

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

  const handleLogout=async()=>{
    const deviceToken=pushTokenRef.current;
    try{
      const sessionToken=await getToken();
      if(sessionToken&&deviceToken){
        await fetch('https://hupera-ai.hatchable.site/api/mobile-push-token',{
          method:'DELETE',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessionToken},
          body:JSON.stringify({token:deviceToken})
        });
      }
    }catch(error){console.warn('Could not unregister Hupera push token on logout',error);}
    pushTokenRef.current='';
    window.dispatchEvent(new Event('hupera-logout'));
  };


  const refreshWorkspace=async()=>{
    if(workspaceSyncBusy.current||document.hidden)return;
    workspaceSyncBusy.current=true;setDataError('');
    try{
      const [dashboard,employees,appointments,inbox,notifications]=await Promise.all([
        getHuperaResource<any>('dashboard'),getHuperaResource<any>('employees'),
        getHuperaResource<any>('appointments'),getHuperaResource<any>('inbox'),getHuperaResource<any>('notifications')
      ]);
      setUnreadNotifications(Number(notifications.unread_count||0));
      setNotifications(Array.isArray(notifications.notifications)?notifications.notifications:[]);
      const bookings=Array.isArray(appointments.appointments)?appointments.appointments:[];
      const conversations=Array.isArray(inbox.conversations)?inbox.conversations:[];
      const mapped:Chat[]=conversations.map((c:any)=>{
        const b=c.latest_booking||bookings.find((x:any)=>x.conversation_id===c.id)||{};
        const customerName=c.customer_name&&c.customer_name!=='Customer message'?c.customer_name:(b.customer_name||c.customer_phone||'Unknown customer');
        const stamp=b.starts_at?new Date(b.starts_at):null;
        const validDate=stamp&&!Number.isNaN(stamp.getTime())?stamp:null;
        return {id:String(c.id),conversationId:String(c.id),bookingId:b.id?String(b.id):undefined,
          name:customerName,phone:String(c.customer_phone||b.customer_phone||''),channel:String(c.channel||'whatsapp'),handlingMode:String(c.handling_mode||'AI'),needsAction:c.needs_action===true,priorityType:c.priority_type?String(c.priority_type):undefined,unreadCount:Number(c.unread_count||0),pendingRequestCount:Number(c.pending_booking_count||0),appointments:[],payments:[],initials:customerName.split(/\\s+/).slice(0,2).map((x:string)=>x[0]||'').join('').toUpperCase(),
          status:String(b.status||c.status||'Open').replace(/_/g,' '),
          time:c.last_message_at?new Date(c.last_message_at).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
          preview:c.last_message||c.subject||'No messages yet',department:b.service_name||b.title||'—',
          doctor:b.resource_name||'—',date:validDate?validDate.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—',
          day:validDate?validDate.toLocaleDateString('en-IN',{weekday:'long'}):'',
          slot:validDate?validDate.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—',
          format:b.location||b.booking_type||'—',amount:Number(b.amount||b.total_amount||0),
          payment:b.payment_status||'—',upi:'',transactionId:b.transaction_reference||undefined,messages:[]};
      });
      setWorkspace((old:any)=>({...old,dashboard,employees:employees.employees||[],appointments:bookings}));
      setChats(old=>mapped.map(chat=>{const previous=old.find(item=>item.id===chat.id);return previous?{...chat,messages:previous.messages,appointments:previous.appointments,payments:previous.payments}:chat;}));
      const urgent=new Set(mapped.filter(c=>c.needsAction).map(c=>c.id));
      if(priorityInitialized.current&&alertsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){for(const c of mapped){if(c.needsAction&&!previousPriorityIds.current.has(c.id)){new Notification(c.priorityType==='payment_confirmation'?'Payment confirmation needs attention':'New appointment request',{body:c.name+' · '+c.preview,tag:'hupera-'+c.id});const ctx=alertAudio.current;if(ctx&&ctx.state==='running'){const oscillator=ctx.createOscillator();const gain=ctx.createGain();oscillator.frequency.value=880;gain.gain.value=0.12;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+0.18);}}}}
      previousPriorityIds.current=urgent;priorityInitialized.current=true;
      if(mapped.length&&!mapped.some(c=>c.id===selected))setSelected(mapped[0].id);
    }catch(e){setDataError(e instanceof Error?e.message:'Unable to load workspace data.');}
    finally{setDataLoading(false);workspaceSyncBusy.current=false;}
  };


  const loadAvailability=async()=>{
    try{
      const data=await getHuperaResource<any>('availability');
      const schedules=Array.isArray(data.schedules)?data.schedules:[];
      const mapped:Day[]=dayNames.map((name,index)=>{
        const rows=schedules.filter((x:any)=>Number(x.day_of_week)===index+1);
        const grouped=new Map<string,any>();
        rows.forEach((x:any,i:number)=>{
          const start=String(x.start_time||'09:00').slice(0,5),end=String(x.end_time||'13:00').slice(0,5);
          const fee=Number(x.fee??x.service_price??0);
          const key=[String(x.service_id||''),start,end,fee,String(x.slot_duration_minutes||''),String(x.buffer_minutes||'')].join('|');
          let block=grouped.get(key);
          if(!block){
            block={id:Date.now()+index*100+i,department:String(x.service_name||''),doctors:[],resourceIds:[],resourceId:'',from:time12(start),to:time12(end),fee,serviceId:String(x.service_id||'')};
            grouped.set(key,block);
          }
          const resourceId=String(x.resource_id||'');
          if(resourceId&&!block.resourceIds.includes(resourceId)){
            block.resourceIds.push(resourceId);
            if(!block.resourceId)block.resourceId=resourceId;
            if(x.person_name)block.doctors.push(String(x.person_name));
          }
        });
        return {name,enabled:rows.length>0,blocks:Array.from(grouped.values())};
      });
      setDays(mapped);
      setAvailabilityItems(Array.isArray(data.items)?data.items:[]);
      const settings=data.settings||{};
      setSlot(String(settings.default_slot_duration_minutes||30));
      setBuffer(String(settings.default_buffer_minutes||0));
      setTimezone(String(settings.timezone||'Asia/Kolkata'));
      setService(String(settings.service_title||'Consultation'));
      setFormat(String(settings.meeting_format||'Phone / WhatsApp consultation'));
      setLocation(String(settings.location||''));
      setPhone(String(settings.host_notification_phone||''));
      setEmail(String(settings.host_notification_email||''));
    }catch(e){setDataError(e instanceof Error?e.message:'Unable to load saved availability.');}
  };

  const saveAvailability=async()=>{
    if(days.some(day=>day.enabled&&day.blocks.some(block=>!block.serviceId||!(Array.isArray(block.resourceIds)&&block.resourceIds.length)&&!block.resourceId))){notify('Choose a department and at least one assigned person for every working block.');return;}
    const schedules=days.flatMap((day,index)=>day.enabled?day.blocks.flatMap(block=>{
      const assigned=Array.isArray(block.resourceIds)&&block.resourceIds.length?block.resourceIds:(block.resourceId?[block.resourceId]:[]);
      return assigned.map(resourceId=>({
        day_of_week:index+1,start_time:time24(block.from),end_time:time24(block.to),
        resource_id:resourceId,service_id:block.serviceId,fee:block.fee,
        slot_duration_minutes:Number(slot),buffer_minutes:Number(buffer)
      }));
    }):[]);
    try{
      await postHuperaAction('schedule_save',{
        schedules,timezone,industry:workspace.dashboard?.organization?.industry||'other',
        service_title:service,meeting_format:format,location,
        host_notification_phone:phone,host_notification_email:email,
        default_slot_duration_minutes:Number(slot),default_buffer_minutes:Number(buffer),
        allow_sunday_bookings:days[6]?.enabled===true
      });
      notify('Availability saved to your workspace.');
      await loadAvailability();
    }catch(e){notify(e instanceof Error?e.message:'Could not save availability.');}
  };

  const loadSettings=async()=>{
    try{const data=await getHuperaResource<any>('settings');setSettingsData(data);}
    catch(e){setDataError(e instanceof Error?e.message:'Unable to load workspace settings.');}
  };

  const saveSettings=async(organization:any,preferences:any)=>{
    setSettingsSaving(true);
    try{
      const data=await postHuperaAction<any>('settings_save',{organization,preferences});
      setSettingsData((old:any)=>({...old,organization:data.organization,preferences:data.settings}));
      notify('Workspace settings saved.');
      await refreshWorkspace();
    }catch(e){notify(e instanceof Error?e.message:'Could not save settings.');}
    finally{setSettingsSaving(false);}
  };


  useEffect(()=>{
    let listener:{remove:()=>Promise<void>}|null=null;
    let active=true;
    void CapacitorApp.addListener('backButton',({canGoBack})=>{
      if(!active)return;
      if(tab==='Inbox'&&mobileChatOpen){setMobileChatOpen(false);return;}
      if(tab==='Settings'&&settings!=='Business profile'){setSettings('Business profile');return;}
      if(tab!=='Home'){setTab('Home');setMobileChatOpen(false);return;}
      if(canGoBack){window.history.back();return;}
      void CapacitorApp.exitApp();
    }).then(value=>{listener=value;if(!active)void value.remove();});
    return()=>{active=false;if(listener)void listener.remove();};
  },[tab,mobileChatOpen,settings]);

  useEffect(()=>{void refreshWorkspace();},[]);

  useEffect(()=>{
    if(!Capacitor.isNativePlatform())return;
    const unread=chats.reduce((total,chat)=>total+Math.max(0,Number(chat.unreadCount||0)),0)+unreadNotifications;
    void Badge.set({count:unread}).catch(error=>console.warn('Hupera app badge update failed',error));
  },[chats,unreadNotifications]);


  // Native Firebase push registration. Ably remains the foreground real-time transport.
  useEffect(()=>{
    if(!Capacitor.isNativePlatform())return;
    let cancelled=false;
    const listeners:any[]=[];
    const setup=async()=>{
      try{
        const sessionToken=await getToken();
        if(!sessionToken||cancelled)return;
        const registration=await PushNotifications.addListener('registration',async(tokenInfo)=>{
          if(cancelled||!tokenInfo?.value)return;
          pushTokenRef.current=tokenInfo.value;
          try{
            const currentSession=await getToken();
            if(!currentSession)return;
            const response=await fetch('https://hupera-ai.hatchable.site/api/mobile-push-token',{
              method:'POST',
              headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentSession},
              body:JSON.stringify({token:tokenInfo.value,deviceName:'Hupera Android'})
            });
            if(!response.ok){console.warn('Hupera push token registration failed',response.status);setPushPermission('registration_failed');}
            else {setPushPermission('registered');setAlertsEnabled(true);}
          }catch(error){console.warn('Hupera push token registration failed',error);}
        });
        listeners.push(registration);
        const registrationError=await PushNotifications.addListener('registrationError',error=>{
          console.warn('Firebase push registration error',error);
          setPushPermission('registration_failed');
        });
        listeners.push(registrationError);
        const actionPerformed=await PushNotifications.addListener('pushNotificationActionPerformed',action=>{
          const data=action.notification?.data||{};
          window.dispatchEvent(new CustomEvent('hupera:push-open',{detail:data}));
        });
        listeners.push(actionPerformed);
        const received=await PushNotifications.addListener('pushNotificationReceived',notification=>{
          if(cancelled)return;
          void refreshWorkspace();
          if(tab==='Inbox'&&active.conversationId)void refreshActiveThread();
          if(notification?.title){
            notify(notification.title);
            void LocalNotifications.schedule({notifications:[{
              id:Math.floor(Date.now()%2147483000),
              title:notification.title,
              body:notification.body||'Open Hupera to view the update',
              channelId:'hupera_messages',
              sound:'default',
              extra:notification.data||{}
            }]});
          }
        });
        listeners.push(received);
        let permission=await PushNotifications.checkPermissions();
        setPushPermission(permission.receive);
        if(cancelled||permission.receive!=='granted')return;
        setAlertsEnabled(true);
        await PushNotifications.createChannel({
          id:'hupera_messages',
          name:'Hupera messages',
          description:'WhatsApp messages, appointment and payment updates',
          importance:5,
          visibility:1,
          sound:'default',
          vibration:true
        });
        let localPermission=await LocalNotifications.checkPermissions();
        if(localPermission.display!=='granted')localPermission=await LocalNotifications.requestPermissions();
        await LocalNotifications.createChannel({
          id:'hupera_messages',
          name:'Hupera messages',
          description:'WhatsApp messages, appointment and payment updates',
          importance:5,
          visibility:1,
          sound:'default',
          vibration:true
        });
        await PushNotifications.register();
      }catch(error){
        console.warn('Hupera native notifications could not start',error);
      }
    };
    void setup();
    return()=>{
      cancelled=true;
      listeners.forEach(listener=>{try{void listener.remove();}catch{}});
    };
  },[]);

  // Notification taps open the relevant Hupera section.
  useEffect(()=>{
    const open=(event:Event)=>{
      const data=(event as CustomEvent).detail||{};
      delete (window as any).__huperaPendingPush;
      if(data.route==='appointment'){setTab('Appointment');setMobileChatOpen(false);return;}
      if(data.route==='inbox'){
        setTab('Inbox');
        if(data.conversationId){setSelected(String(data.conversationId));setMobileChatOpen(true);}
      }
    };
    window.addEventListener('hupera:push-open',open);
    const pending=(window as any).__huperaPendingPush;
    if(pending){delete (window as any).__huperaPendingPush;open(new CustomEvent('hupera:push-open',{detail:pending}));}
    return()=>window.removeEventListener('hupera:push-open',open);
  },[]);

  useEffect(()=>{if(tab==='Appointment')void loadAvailability();if(tab==='Settings')void loadSettings();},[tab]);

  useEffect(()=>{
    let cancelled=false;
    getHuperaResource<any>('reports',{days:period.replace(' days','')})
      .then(reports=>{if(!cancelled)setWorkspace((old:any)=>({...old,reports}));})
      .catch(error=>{if(!cancelled)setDataError(error instanceof Error?error.message:'Unable to load reports.');});
    return ()=>{cancelled=true;};
  },[period]);


  // Workspace state is refreshed by Ably events; no interval polling.

  useEffect(()=>{
    if(!active.conversationId||tab!=='Inbox')return;
    let cancelled=false;
    const loadThread=()=>getHuperaResource<any>('thread',{conversation_id:active.conversationId}).then((data)=>{
      if(cancelled)return;
      const messages=(data.messages||[]).map((m:any)=>({
        id:String(m.id||''),from:m.sender_type==='customer'?'customer':(m.sender_type==='human'||m.sender_type==='business')?'human':m.sender_type==='system'?'system':'ai',
        text:String(m.content||''),type:String(m.message_type||'text'),metadata:m.metadata,createdAt:String(m.created_at||''),time:m.created_at?new Date(m.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''
      } as Msg));
      setChats(old=>old.map(c=>c.id===active.id?{...c,messages,appointments:Array.isArray(data.appointments)?data.appointments:[],payments:Array.isArray(data.payments)?data.payments:[],handlingMode:String(data.conversation?.handling_mode||c.handlingMode),needsAction:data.conversation?.needs_action===true,unreadCount:Number(data.conversation?.unread_count||0)}:c));
    }).catch(e=>{if(!cancelled)setDataError(e instanceof Error?e.message:'Unable to load conversation.');});
    void loadThread();
    return ()=>{cancelled=true;};
  },[active.conversationId,tab]);

  const enableAlerts=async()=>{
    if(Capacitor.isNativePlatform()){
      try{
        let permission=await PushNotifications.checkPermissions();
        if(permission.receive!=='granted')permission=await PushNotifications.requestPermissions();
        setPushPermission(permission.receive);
        if(permission.receive!=='granted'){setAlertsEnabled(false);notify('Allow notifications for Hupera in Android settings, then try again.');return;}
        await PushNotifications.createChannel({id:'hupera_messages',name:'Hupera messages',description:'WhatsApp messages, appointment and payment updates',importance:5,visibility:1,sound:'default',vibration:true});
        let localPermission=await LocalNotifications.checkPermissions();
        if(localPermission.display!=='granted')localPermission=await LocalNotifications.requestPermissions();
        if(localPermission.display!=='granted'){setAlertsEnabled(false);notify('Android notification permission is required to show alerts.');return;}
        await LocalNotifications.createChannel({id:'hupera_messages',name:'Hupera messages',description:'WhatsApp messages, appointment and payment updates',importance:5,visibility:1,sound:'default',vibration:true});
        await PushNotifications.register();
        setAlertsEnabled(true);
        notify('Android notifications allowed. Registering this device with Firebase…');
      }catch(error){console.warn('Hupera Android notification permission failed',error);setPushPermission('registration_failed');notify('Could not enable Android notifications. Check app notification permission in Android settings.');}
      return;
    }
    if(typeof Notification==='undefined'){setPushPermission('unsupported');notify('Notifications are not supported in this browser.');return;}
    const permission=await Notification.requestPermission();
    setPushPermission(permission);
    setAlertsEnabled(permission==='granted');
    if(permission==='granted'&&typeof AudioContext!=='undefined'){try{const ctx=new AudioContext();await ctx.resume();alertAudio.current=ctx;}catch{}}
    notify(permission==='granted'?'Inbox notifications and sound alerts enabled.':'Notification permission was not granted.');
  };

  const refreshActiveThread=async()=>{
    if(!active.conversationId||threadSyncBusy.current)return;
    threadSyncBusy.current=true;
    try{
      const data=await getHuperaResource<any>('thread',{conversation_id:active.conversationId});
      const messages=(data.messages||[]).map((m:any)=>({
        id:String(m.id||''),from:m.sender_type==='customer'?'customer':(m.sender_type==='human'||m.sender_type==='business')?'human':m.sender_type==='system'?'system':'ai',
        text:String(m.content||''),type:String(m.message_type||'text'),metadata:m.metadata,
        createdAt:String(m.created_at||''),time:m.created_at?new Date(m.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''
      } as Msg));
      setChats(old=>old.map(c=>c.id===active.id?{...c,messages,appointments:Array.isArray(data.appointments)?data.appointments:[],payments:Array.isArray(data.payments)?data.payments:[],handlingMode:String(data.conversation?.handling_mode||c.handlingMode),needsAction:data.conversation?.needs_action===true,unreadCount:Number(data.conversation?.unread_count||0)}:c));
    }catch(error){console.warn('Hupera active chat refresh failed',error);}
    finally{threadSyncBusy.current=false;}
  };

  useEffect(()=>{
    let disposed=false;
    let realtime:any=null;
    let channel:any=null;
    let retryHandle:number|undefined;
    const connect=async()=>{
      try{
        const sessionToken=await getToken();
        if(!sessionToken||disposed)return;
        const Ably=(window as any).Ably;
        if(!Ably?.Realtime)throw new Error('Realtime library did not load. Check your internet connection.');
        const authUrl='https://hupera-ai.hatchable.site/api/realtime-token';
        const authResponse=await fetch(authUrl,{method:'GET',headers:{Authorization:'Bearer '+sessionToken}});
        const tokenDetails=await authResponse.json().catch(()=>({}));
        if(!authResponse.ok||!tokenDetails.token||!tokenDetails.channel)throw new Error(tokenDetails.error||'Secure realtime authentication failed.');
        if(disposed)return;
        realtime=new Ably.Realtime({
          tokenDetails,
          authUrl,
          authMethod:'GET',
          authHeaders:{Authorization:'Bearer '+sessionToken},
          autoConnect:true,
          disconnectedRetryTimeout:5000,
          suspendedRetryTimeout:10000
        });
        channel=realtime.channels.get(tokenDetails.channel);
        channel.subscribe((message:any)=>{
          if(disposed)return;
          const eventName=String(message?.name||'');
          if(!['message.created','conversation.updated','appointment.created','appointment.updated','payment.updated','availability.updated'].includes(eventName))return;
          void refreshWorkspace();
          if(eventName==='availability.updated'&&tab==='Appointment')void loadAvailability();
          if(tab==='Inbox'&&active.conversationId)void refreshActiveThread();
        });
        realtime.connection.on('connected',()=>{if(!disposed){setDataError('');void refreshWorkspace();if(tab==='Inbox'&&active.conversationId)void refreshActiveThread();}});
        realtime.connection.on('disconnected',()=>{if(!disposed)setDataError('Live connection interrupted. Automatic inbox sync is active.');});
        realtime.connection.on('failed',()=>{if(!disposed)setDataError('Realtime connection failed. Automatic inbox sync is active while you reconnect.');});
      }catch(error){
        if(!disposed)console.error('Hupera realtime connection failed',error);
      }
    };
    void connect();
    return ()=>{
      disposed=true;
      if(retryHandle!==undefined)window.clearTimeout(retryHandle);
      try{channel?.unsubscribe();}catch{}
      try{realtime?.close();}catch{}
    };
  },[tab,active.conversationId]);

  // Refresh workspace summaries at a measured interval; Ably events still trigger immediate updates.
  useEffect(()=>{
    const syncVisibleWorkspace=()=>{
      if(document.hidden)return;
      void refreshWorkspace();
    };
    const timer=window.setInterval(syncVisibleWorkspace,30000);
    document.addEventListener('visibilitychange',syncVisibleWorkspace);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',syncVisibleWorkspace);
    };
  },[tab]);

  // Keep the selected conversation near-live even when the realtime socket is interrupted.
  useEffect(()=>{
    if(tab!=='Inbox'||!active.conversationId)return;
    const syncActiveThread=()=>{if(!document.hidden)void refreshActiveThread();};
    const timer=window.setInterval(syncActiveThread,5000);
    document.addEventListener('visibilitychange',syncActiveThread);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',syncActiveThread);
    };
  },[tab,active.conversationId]);

  // Keep appointment availability in sync with website-side schedule edits.
  useEffect(()=>{
    if(tab!=='Appointment')return;
    const syncAvailability=()=>{if(!document.hidden)void loadAvailability();};
    const timer=window.setInterval(syncAvailability,15000);
    document.addEventListener('visibilitychange',syncAvailability);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',syncAvailability);
    };
  },[tab]);

  const updateBookingStatus=async(bookingId:string,status:'confirmed'|'cancelled'|'rescheduled')=>{
    if(!bookingId){notify('This request is not linked to a booking record.');return;}
    let startsAt:string|undefined;
    if(status==='rescheduled'){
      const value=window.prompt('Enter the new date and time (YYYY-MM-DDTHH:mm)');
      if(!value)return;
      const parsed=new Date(value);
      if(!Number.isFinite(parsed.getTime())||parsed<=new Date()){notify('Choose a valid future date and time.');return;}
      startsAt=parsed.toISOString();
    }
    if(status==='cancelled'&&!window.confirm('Cancel this appointment?'))return;
    try{
      await postHuperaAction('booking_status',{booking_id:bookingId,status,...(startsAt?{starts_at:startsAt}:{})});
      notify('Appointment '+status+'.');
      await refreshWorkspace();
      await refreshActiveThread();
    }catch(e){notify(e instanceof Error?e.message:'Could not update appointment.');}
  };

  const reviewPayment=async(bookingId:string,decision:'received'|'not_received')=>{
    if(!bookingId){notify('This payment request is not linked to a booking.');return;}
    const note=decision==='not_received'?(window.prompt('Optional reason (for audit history):')||''):'';
    try{
      await postHuperaAction('payment_review',{booking_id:bookingId,decision,note});
      notify(decision==='received'?'Payment marked as received.':'Payment marked as not received.');
      await refreshWorkspace();
      await refreshActiveThread();
    }catch(e){notify(e instanceof Error?e.message:'Could not review payment.');}
  };

  const updateDay=(i:number,p:Partial<Day>)=>setDays(old=>old.map((d,n)=>n===i?{...d,...p}:d));
  const updateBlock=(di:number,id:number,p:Partial<Block>)=>setDays(old=>old.map((d,i)=>i===di?{...d,blocks:d.blocks.map(b=>b.id===id?{...b,...p}:b)}:d));

  const nav=[['Home',Home],['Inbox',MessageCircle],['Appointment',CalendarDays],['Reports',Activity],['Settings',Settings]] as const;
  const businessName=String(workspace.dashboard?.organization?.name||'').trim();
  const hour=new Date().getHours();
  const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  return (
    <div className={`app-shell ${theme==='dark'?'dark-theme':''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Bot size={22}/></div><div><b>Hupera <span>AI</span></b><small>CLIENT WORKSPACE</small></div></div>
        <div className="workspace-switch"><div className="hospital-icon"><Stethoscope size={17}/></div><div><b>{workspace.dashboard?.organization?.name||'Hupera Workspace'}</b><small>Business account</small></div><ChevronDown size={15}/></div>
        <div className="nav-label">WORKSPACE</div>
        {nav.map(([n,I])=><button key={n} className={'side-link '+(tab===n?'selected':'')} onClick={()=>{setTab(n);setSearch('');setMobileChatOpen(false);}}><I size={17}/><span>{n}</span>{n==='Inbox'&&pendingReviewCount>0&&<i className="nav-count">{pendingReviewCount>99?'99+':pendingReviewCount}</i>}</button>)}
        <div className="sidebar-bottom"><i className="online-dot"/> <span>AI workforce operational</span><small>Live inbox · backend connected</small></div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><Bot size={20}/></div><b>Hupera <span>AI</span></b></div>
          <div className="top-actions">
            <div className="notification-wrap">
              <button className="icon-btn notification-bell" onClick={()=>setShowNotifications(value=>!value)} aria-label={'Open notifications, '+unreadNotifications+' unread'} aria-expanded={showNotifications}><Bell size={18}/>{unreadNotifications>0&&<i className="top-badge">{unreadNotifications>99?'99+':unreadNotifications}</i>}</button>
              {showNotifications&&<div className="notification-panel">
                <div className="notification-panel-head"><b>Notifications</b><button type="button" onClick={async()=>{try{await postHuperaAction('notifications_mark_all_read',{});setUnreadNotifications(0);setNotifications(old=>old.map(item=>({...item,is_read:true})));}catch(error){console.warn('Could not mark notifications read',error);}}}>Mark all read</button></div>
                <div className="notification-items">{notifications.length?notifications.map((item:any)=><button type="button" key={item.id} className={'notification-item '+(!item.is_read?'unread':'')} onClick={async()=>{try{await postHuperaAction('notification_read',{notification_id:item.id});}catch(error){console.warn('Could not mark notification read',error);}setNotifications(old=>old.map(value=>value.id===item.id?{...value,is_read:true}:value));setUnreadNotifications(value=>Math.max(0,value-(item.is_read?0:1)));setShowNotifications(false);if(item.conversation_id){setTab('Inbox');setSelected(String(item.conversation_id));setMobileChatOpen(true);}else if(['appointment','booking','payment'].includes(String(item.kind||'').toLowerCase())){setTab('Appointment');setMobileChatOpen(false);}}}><i className="notification-dot"/><span><b>{item.title}</b><small>{item.body}</small><time>{item.created_at?new Date(item.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</time></span></button>):<div className="notification-empty">No notifications yet.</div>}</div>
              </div>}
            </div>
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme==='light'?'Switch to dark mode':'Switch to light mode'} title={theme==='light'?'Dark mode':'Light mode'}>
              {theme==='light'?<Moon size={19}/>:<Sun size={19}/>}
            </button>
            <button className="outline-button" onClick={handleLogout} title="Authentication must be connected for real logout">
              <LogOut size={16}/> Logout
            </button>
            <div className="profile"><div className="profile-avatar">{(businessName||'H').slice(0,1).toUpperCase()}</div><div><b>{businessName||'Hupera workspace'}</b><small>AUTHENTICATED WORKSPACE</small></div></div>
          </div>
        </header>

        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{workspace.dashboard?.organization?.name||'HUPERA WORKSPACE'} <span>/</span> {tab.toUpperCase()}</div>
              <h1>{tab==='Home'?greeting+(businessName?', '+businessName:''):tab==='Appointment'?'Availability & hours':tab==='Inbox'?'AI Inbox & WhatsApp Chats':tab==='Reports'?'Reports & analytics':'Settings'}</h1>
              <p>{tab==='Home'?'Here’s what’s happening with your business today.':tab==='Appointment'?'Set timing defaults once, then define one or more working blocks for each day.':tab==='Inbox'?'Complete appointment details, chat history & manual payment verification':tab==='Reports'?'Track appointments, revenue, customers and AI performance.':'Manage your hospital workspace and connected services.'}</p>
            </div>
            {tab==='Home'&&<div className="date-chip"><CalendarDays size={15}/> {new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</div>}
          </div>

          <div className="demo-strip"><span className="demo-indicator"/><div><b>{dataLoading?'Loading workspace':'Live workspace data'}</b><span>{dataError||'Automatically syncing with your signed-in Hupera workspace.'}</span></div></div>

          {tab==='Home'&&<>
            <div className="section-title"><h2>Today at a glance</h2><button onClick={()=>setTab('Reports')}>View reports <ArrowUpRight size={14}/></button></div>
            <div className="stats-grid">
              <Metric icon={CalendarDays} label="Today's appointments" value={String(workspace.dashboard?.today_appointments?.total??0)} change="Live" detail="today"/>
              <Metric icon={Clock3} label="Appointment pending" value={String(workspace.dashboard?.counts?.pending_appointments??0)} change="Live" detail="pending appointments"/>
              <Metric icon={CalendarCheck} label="Appointments" value={String(workspace.dashboard?.counts?.appointments??0)} change="Live" detail="workspace total"/>
              <Metric icon={MessageCircle} label="Conversations" value={String(workspace.dashboard?.counts?.conversations??0)} change="Live" detail="workspace total"/>
            </div>
            <div className="stats-grid home-secondary-metrics">
              <Metric icon={CheckCircle2} label="Completed today" value={String((workspace.appointments||[]).filter((b:any)=>b.starts_at&&new Date(b.starts_at).toDateString()===new Date().toDateString()&&String(b.status||'').toLowerCase()==='completed').length)} change="Live" detail="completed appointments"/>
              <Metric icon={Bot} label="AI response share" value={String((()=>{const ai=Number(workspace.reports?.ai_responses?.total||0),human=Number(workspace.reports?.messages?.human_replies||0);return ai+human?Math.round(ai/(ai+human)*100):0;})())+'%'} change="Live" detail="AI replies / AI + staff replies"/>
            </div>
            <div className="home-grid">
              <section className="panel">
                <div className="section-title inside"><h2>Upcoming appointments</h2><button onClick={()=>setTab('Inbox')}>Open inbox <ChevronRight size={14}/></button></div>
                {(workspace.appointments||[]).filter((b:any)=>b.starts_at&&new Date(b.starts_at)>=new Date()&&!['cancelled','declined'].includes(String(b.status||'').toLowerCase())).sort((a:any,b:any)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()).slice(0,5).map((b:any)=><div className="mini-booking" key={b.id} role={b.conversation_id?'button':undefined} tabIndex={b.conversation_id?0:undefined} onClick={()=>{if(b.conversation_id){setSelected(String(b.conversation_id));setTab('Inbox');setMobileChatOpen(true);}}}><span className="avatar violet">{String(b.customer_name||'C').split(' ').map((x:string)=>x[0]).join('').slice(0,2)}</span><span className="mini-booking-info"><b>{b.customer_name||'Customer'}</b><small>{[b.service_name||b.title,b.resource_name].filter(Boolean).join(' · ')||'Appointment'}</small></span><b className="booking-time">{b.starts_at?new Date(b.starts_at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</b></div>)}{!dataLoading&&(workspace.appointments||[]).filter((b:any)=>b.starts_at&&new Date(b.starts_at)>=new Date()&&!['cancelled','declined'].includes(String(b.status||'').toLowerCase())).length===0&&<p className="muted-copy">No appointments scheduled for today.</p>}
              </section>
            </div>
            <section className="panel activity-panel">
              <div className="section-title inside"><h2>Recent activity</h2><small>Workspace audit events</small></div>
              {(workspace.dashboard?.recent_activity||[]).map((event:any)=><div className="activity-row" key={event.id}><span className="activity-icon"><Activity size={17}/></span><span className="activity-text"><b>{String(event.action||'Workspace update').replace(/[._]/g,' ')}</b><small>{event.resource_type||'Workspace'} · {event.resource_id||''}</small></span><time>{event.created_at?new Date(event.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}):''}</time></div>)}
              {!workspace.dashboard?.recent_activity?.length&&<p className="muted-copy">No recent activity recorded.</p>}
            </section>
          </>}

          {tab==='Inbox'&&<>
            <section className={'inbox-panel '+(mobileChatOpen?'mobile-chat-open':'')}>
              <aside className="inbox-list">
                <div className="inbox-list-head"><div><h2>AI Inbox Conversations</h2><small>● Live · instant realtime updates</small></div><button className="outline-button" onClick={enableAlerts}>Enable alerts</button></div>
                <div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer chats..."/></div>
                <div className="inbox-chat-list">{filtered.map(c=><button className={'chat-row '+(active.id===c.id?'chosen ':'')+(c.needsAction?'priority-chat':'')+((c.unreadCount>0||c.pendingRequestCount>0||c.needsAction)?' has-unread':'')} key={c.id} onClick={()=>{setSelected(c.id);setMobileChatOpen(true);}}><span className="avatar violet">{c.initials}</span><span className="chat-copy"><span className="between"><b>{c.name}</b><small>{c.time}</small></span><p>{c.preview}</p><span className="chat-status">{c.status}</span>{c.needsAction&&<span className="priority-badge">{c.priorityType==='payment_confirmation'?'Payment needs action':'New appointment request'}</span>}{c.unreadCount>0&&!c.needsAction&&<span className="new-message-badge">New message</span>}{c.pendingRequestCount>0&&!c.needsAction&&<span className="new-message-badge">{c.pendingRequestCount} new appointment{c.pendingRequestCount===1?'':'s'}</span>}</span>{c.unreadCount>0&&<i className="unread-count">{c.unreadCount}</i>}</button>)}{filtered.length===0&&<div className="empty-block">{search?'No conversations match your search.':'No conversations have arrived yet.'}</div>}</div>
              </aside>
              <section className="chat-detail">
                <div className="chat-detail-head"><button type="button" className="mobile-chat-back" onClick={()=>setMobileChatOpen(false)}><ChevronRight size={18}/> Back to inbox</button><span className="avatar violet">{active.initials}</span><span className="chat-person"><b>{active.name}</b><small>{active.channel.toLowerCase().includes('whatsapp')?'WhatsApp':active.channel} · {active.phone||'Phone not available'} · {active.status}</small></span><button className="outline-button" onClick={async()=>{try{await postHuperaAction('conversation_mode',{conversation_id:active.conversationId,mode:human?'AI':'Human'});notify(human?'AI agent resumed for this chat.':'You have taken over this chat. AI replies are paused.');setChats(old=>old.map(c=>c.id===active.id?{...c,handlingMode:human?'AI':'Human',needsAction:false,unreadCount:0}:c));}catch(e){notify(e instanceof Error?e.message:'Could not change conversation mode.');}}}>{human?'🤖 Resume AI Agent':'🤖 AI Active — Click to Take Over'}</button></div>
                <div className="chat-history-head"><div><h3>Complete conversation history</h3><small>{active.messages.length} messages · oldest to newest</small></div><span className="mode-pill">{human?'Human takeover active':'AI agent active'}</span></div>
                <div className="chat-thread">{[
                  ...(active.appointments||[]).map((item:any)=>({kind:'appointment',item,at:item.created_at||item.starts_at||''})),
                  ...(active.appointments||[]).filter((item:any)=>item.payment_confirmation_requested_at||['reported','awaiting_confirmation','declined'].includes(String(item.payment_status||'').toLowerCase())||!!item.payment_reference).map((item:any)=>({kind:'payment_review',item,at:item.payment_confirmation_requested_at||item.created_at||''})),
                  ...(active.payments||[]).map((item:any)=>({kind:'payment_order',item,at:item.created_at||''})),
                  ...(active.messages||[]).map((item:any,index:number)=>({kind:'message',item,index,at:item.createdAt||item.time||''}))
                ].sort((a:any,b:any)=>new Date(a.at||0).getTime()-new Date(b.at||0).getTime()).reduce((items:any[],entry:any)=>{
                   const date=entry.at?new Date(entry.at):null;
                   if(date&&!Number.isNaN(date.getTime())){
                     const dateKey=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
                     if(!items.length||items[items.length-1].dateKey!==dateKey){
                       const today=new Date(),yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
                       const keyOf=(value:Date)=>[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
                       const label=dateKey===keyOf(today)?'Today':dateKey===keyOf(yesterday)?'Yesterday':date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
                       items.push({kind:'day-divider',key:'day-'+dateKey,label,dateKey});
                     }
                     items.push({...entry,dateKey});
                   }else items.push(entry);
                   return items;
                 },[] as any[]).map((entry:any)=>{
                   if(entry.kind==='day-divider')return <div className="chat-day-divider" key={entry.key}><span>{entry.label}</span></div>;
                  if(entry.kind==='appointment'){
                    const b=entry.item;const status=String(b.status||'pending').toLowerCase();const locked=['confirmed','rescheduled','cancelled','completed','deleted'].includes(status);const bookingAudit=(active.messages||[]).filter((m:any)=>m.type==='appointment_status'&&m.metadata?.booking_id===b.id).slice(-1)[0];
                    return <div className="message-wrap system" key={'appointment-'+b.id}><article className={'appointment-request '+(!locked?'priority-action-card':'')}><div className="request-heading"><CalendarCheck size={17}/><b>Appointment request</b><span className={'status-badge '+(status==='confirmed'?'ok':'neutral')}>{status.replace(/_/g,' ')}</span></div><div className="request-details"><span>Service</span><b>{b.service_name||b.title||'Appointment'}</b></div><div className="request-details"><span>Date & time</span><b>{b.starts_at?new Date(b.starts_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Awaiting slot selection'}</b></div><div className="request-details"><span>Assigned person</span><b>{b.resource_name||'Not assigned'}</b></div><div className="request-details"><span>Amount</span><b>{new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(b.amount||0))}</b></div><div className="request-details"><span>Reference</span><b>{b.reference_code||'—'}</b></div>{locked?<div className="action-audit"><CheckCircle2 size={14}/> {status==='confirmed'?'Confirmed':status==='cancelled'?'Cancelled':status==='completed'?'Completed':'Closed'} · {bookingAudit?'Updated by '+String(bookingAudit.metadata?.actor_user_id||'workspace staff')+' · '+bookingAudit.time:(b.updated_at?new Date(b.updated_at).toLocaleString('en-IN'):'Saved in workspace')}</div>:<div className="appointment-actions"><button className="primary-button" onClick={()=>void updateBookingStatus(String(b.id),'confirmed')}><Check size={14}/> Confirm Booking</button><button className="outline-button" onClick={()=>void updateBookingStatus(String(b.id),'rescheduled')}><RefreshCw size={14}/> Reschedule</button><button className="danger-button" onClick={()=>void updateBookingStatus(String(b.id),'cancelled')}><X size={14}/> Cancel</button></div>}</article></div>;
                  }
                  if(entry.kind==='payment_review'){
                    const b=entry.item;const paymentStatus=String(b.payment_status||'pending').toLowerCase();const settled=['paid','succeeded','completed'].includes(paymentStatus);const declined=paymentStatus==='declined';const paymentAudit=(active.messages||[]).filter((m:any)=>m.type==='payment_status'&&m.metadata?.booking_id===b.id).slice(-1)[0];
                    return <div className="message-wrap system" key={'payment-review-'+b.id}><article className={'appointment-request payment-request-card '+(!settled&&!declined?'priority-action-card':'')}><div className="request-heading"><CreditCard size={17}/><b>Payment confirmation request</b><span className={'status-badge '+(settled?'ok':declined?'warning':'neutral')}>{settled?'received':declined?'not received':paymentStatus}</span></div><div className="request-details"><span>Appointment</span><b>{b.reference_code||b.title||'Appointment'}</b></div><div className="request-details"><span>Amount</span><b>{new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(b.amount||0))}</b></div><div className="request-details"><span>Reference / UTR</span><b>{b.payment_reference||'Not supplied'}</b></div>{settled||declined?<div className="action-audit"><CheckCircle2 size={14}/> {settled?'Payment received':'Payment not received'} · {paymentAudit?'Reviewed by '+String(paymentAudit.metadata?.actor_user_id||'workspace staff')+' · '+paymentAudit.time:(b.payment_reviewed_at?new Date(b.payment_reviewed_at).toLocaleString('en-IN'):'Review saved')}</div>:<div className="appointment-actions"><button className="primary-button" onClick={()=>void reviewPayment(String(b.id),'received')}>Receive Payment</button><button className="danger-button" onClick={()=>void reviewPayment(String(b.id),'not_received')}>Payment Not Received</button></div>}</article></div>;
                  }
                  if(entry.kind==='payment_order'){
                    const p=entry.item;const booking=(active.appointments||[]).find((x:any)=>x.id===p.booking_id);const paymentState=String(booking?.payment_status||p.status||'pending').toLowerCase();const paid=['paid','succeeded','completed'].includes(paymentState);const declined=paymentState==='declined';
                    return <div className="message-wrap system" key={'payment-order-'+p.id}><article className={'appointment-request payment-request-card '+(!paid&&!declined?'priority-action-card':'')}><div className="request-heading"><CreditCard size={17}/><b>Payment request</b><span className={'status-badge '+(paid?'ok':'neutral')}>{paid?'received':declined?'not received':String(p.status||'pending')}</span></div><div className="request-details"><span>Amount</span><b>{new Intl.NumberFormat('en-IN',{style:'currency',currency:p.currency||'INR'}).format(Number(p.amount||0))}</b></div><div className="request-details"><span>Payment type</span><b>{p.payment_kind||'Appointment payment'}</b></div><div className="request-details"><span>Provider</span><b>{p.provider||'—'}</b></div>{p.payment_link_url&&<p><a href={p.payment_link_url} target="_blank" rel="noreferrer">Open payment link</a></p>}{booking&&!paid&&!declined&&<div className="appointment-actions"><button className="primary-button" onClick={()=>void reviewPayment(String(booking.id),'received')}>Receive Payment</button><button className="danger-button" onClick={()=>void reviewPayment(String(booking.id),'not_received')}>Payment Not Received</button></div>}</article></div>;
                  }
                  const m=entry.item;
                  if(m.type==='appointment_request')return <div key={m.id||entry.index} className="message-wrap customer"><article className="appointment-request priority-action-card"><div className="request-heading"><CalendarCheck size={17}/><b>New appointment request</b></div><p>{m.text}</p><small className="message-time">{m.time}</small></article></div>;
                  if(m.type==='payment_confirmation')return <div key={m.id||entry.index} className="message-wrap customer"><article className="appointment-request payment-request-card priority-action-card"><div className="request-heading"><CreditCard size={17}/><b>Payment confirmation request</b></div><p>{m.text}</p><small className="message-time">{m.time}</small></article></div>;
                  return <div key={m.id||entry.index} className={'message-wrap '+m.from}><div className={'message '+(m.from==='customer'?'received':m.from==='system'?'system-message':'sent')}><small className="sender">{m.from==='customer'?'Customer':m.from==='ai'?'Hupera AI':m.from==='human'?'Team member':'System update'}</small>{m.text}<small className="message-time">{m.time}</small></div></div>;
                })}</div>
                <div className="chat-quick-actions"><small>Messages are sent through the connected channel. AI automation is {human?'paused for this chat':'active for this chat'}.</small></div>
                <form className="reply-box" onSubmit={async e=>{e.preventDefault();if(!reply.trim()||!active.conversationId)return;try{await postHuperaAction('reply',{conversation_id:active.conversationId,message:reply.trim()});setReply('');notify('Message sent.');const data=await getHuperaResource<any>('thread',{conversation_id:active.conversationId});const messages=(data.messages||[]).map((m:any)=>({id:String(m.id||''),from:m.sender_type==='customer'?'customer':(m.sender_type==='human'||m.sender_type==='business')?'human':m.sender_type==='system'?'system':'ai',text:String(m.content||''),type:String(m.message_type||'text'),metadata:m.metadata,createdAt:String(m.created_at||''),time:m.created_at?new Date(m.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''} as Msg));setChats(old=>old.map(c=>c.id===active.id?{...c,messages}:c));}catch(err){notify(err instanceof Error?err.message:'Message could not be sent.');}}}><input value={reply} onChange={e=>setReply(e.target.value)} placeholder={human?'Type a message as human agent...':'Type a message to customer...'}/><button aria-label="Send message" disabled={!reply.trim()}><Send size={17}/></button></form>
              </section>
            </section>
          </>}

          {tab==='Appointment'&&<AppointmentPage days={days} setDays={setDays} updateDay={updateDay} updateBlock={updateBlock} items={availabilityItems} slot={slot} setSlot={setSlot} buffer={buffer} setBuffer={setBuffer} timezone={timezone} setTimezone={setTimezone} service={service} setService={setService} format={format} setFormat={setFormat} location={location} setLocation={setLocation} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} showPreview={showPreview} setShowPreview={setShowPreview} notify={notify} onSave={saveAvailability}/>}
          {tab==='Reports'&&<Reports period={period} setPeriod={setPeriod} reports={workspace.reports}/>}
          {tab==='Settings'&&<SettingsPage employees={workspace.employees||[]} section={settings} setSection={setSettings} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} enableAlerts={enableAlerts} settingsData={settingsData} saving={settingsSaving} onSave={saveSettings} alertsEnabled={alertsEnabled} pushPermission={pushPermission} nativePlatform={Capacitor.isNativePlatform()}/> }

          <footer className="footer"><span>Hupera AI Client · v0.4.0</span><span><ShieldCheck size={13}/> Secure workspace · Live organization data</span></footer>
        </main>
      </div>

      <nav className="mobile-nav">{nav.map(([n,I])=><button key={n} className={tab===n?'active':''} onClick={()=>{setTab(n);setMobileChatOpen(false);}}><span className="mobile-nav-icon"><I size={19}/>{n==='Inbox'&&pendingReviewCount>0&&<i className="mobile-nav-badge">{pendingReviewCount>99?'99+':pendingReviewCount}</i>}</span><span>{n}</span></button>)}</nav>
      {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
    </div>
  );
}

function AppointmentPage(p:any) {
  const {days,setDays,updateDay,updateBlock,items,slot,setSlot,buffer,setBuffer,timezone,setTimezone,service,setService,format,setFormat,location,setLocation,phone,setPhone,email,setEmail,showPreview,setShowPreview,notify,onSave}=p;
  const [copy,setCopy]=useState<Record<number,string>>({});
  const services=(items||[]).filter((x:any)=>x.kind==='service'&&x.active!==false);
  const people=(items||[]).filter((x:any)=>x.kind==='person'&&x.active!==false);
  const copyTo=(from:number,to:number)=>{
    setDays((old:Day[])=>old.map((d,i)=>i===to?{...d,enabled:old[from].enabled,blocks:old[from].blocks.map(b=>({...b,id:Date.now()+Math.random(),doctors:[...b.doctors],resourceIds:[...(b.resourceIds|| (b.resourceId?[b.resourceId]:[]))]}))}:d));
    notify(days[from].name+' schedule copied to '+days[to].name+'.');
  };
  const assignedIds=(block:Block)=>Array.isArray(block.resourceIds)&&block.resourceIds.length?block.resourceIds:(block.resourceId?[block.resourceId]:[]);
  const updateAssignedPeople=(di:number,block:Block,nextIds:string[])=>{
    const unique=[...new Set(nextIds)];
    updateBlock(di,block.id,{resourceIds:unique,resourceId:unique[0]||'',doctors:people.filter((person:any)=>unique.includes(String(person.id))).map((person:any)=>String(person.name))});
  };
  const addBlock=(day:Day)=>{
    setDays((old:Day[])=>old.map(d=>d.name===day.name?{...d,blocks:[...d.blocks,{id:Date.now()+Math.random(),department:'',doctors:[],from:'09:00 AM',to:'01:00 PM',fee:0,resourceId:'',resourceIds:[],serviceId:''}]}:d));
  };
  return <section className="appointment-page">
    <div className="panel config-panel">
      <div className="section-title inside"><div><h2>Availability defaults</h2><p>These settings are saved to this organisation and shared with the website booking flow.</p></div><span className="status-pill">{timezone}</span></div>
      <div className="settings-grid">
        <label>Default slot duration<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
        <label>Buffer between meetings<select value={buffer} onChange={e=>setBuffer(e.target.value)}><option value="0">No buffer</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></label>
        <label>Timezone<input value={timezone} onChange={e=>setTimezone(e.target.value)}/></label>
        <label>Booking / service title<input value={service} onChange={e=>setService(e.target.value)} placeholder="Consultation"/></label>
        <label>Meeting format<select value={format} onChange={e=>setFormat(e.target.value)}><option>Phone / WhatsApp consultation</option><option>In-person visit</option><option>Video consultation</option><option>Phone call</option></select></label>
        <label>Location / meeting point<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Business address or meeting point"/></label>
        <label>Host notification phone<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Business contact number"/></label>
        <label>Notification email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Business notification email"/></label>
      </div>
    </div>
    <div className="section-title schedule-heading"><div><h2>Weekly schedule</h2><p>Each day and each working shift is shown in its own card.</p></div><button className="outline-button" onClick={()=>days.slice(1,6).forEach((_:Day,i:number)=>copyTo(0,i+1))}>Copy Monday to weekdays</button></div>
    <div className="schedule-list">{days.map((day:Day,di:number)=><section className={'panel day-card '+(!day.enabled?'day-disabled':'')} key={day.name}>
      <div className="day-head"><div className="day-title"><button className={'toggle '+(day.enabled?'on':'')} onClick={()=>updateDay(di,{enabled:!day.enabled})}><span/></button><div><h3>{day.name}</h3><small>{day.enabled?day.blocks.length+' working block(s)':'Unavailable'}</small></div></div>
        <div className="day-controls"><button className="text-button" onClick={()=>addBlock(day)}><Plus size={15}/> Add working block</button><select value={copy[di]||''} onChange={e=>{setCopy(v=>({...v,[di]:e.target.value}));if(e.target.value!=='')copyTo(di,Number(e.target.value))}}><option value="">Copy to…</option>{days.map((d:Day,i:number)=>i!==di&&<option key={d.name} value={i}>{d.name}</option>)}</select></div>
      </div>
      {day.enabled&&day.blocks.map((b:Block)=><div className="schedule-block" key={b.id}>
        <div className="block-top"><span className="block-label">WORKING SHIFT</span><button className="plain-icon" onClick={()=>updateDay(di,{blocks:day.blocks.filter(x=>x.id!==b.id)})}><X size={16}/></button></div>
        <div className="block-grid">
          <label className="wide-field">Department / service<select value={b.serviceId} onChange={e=>{const item=services.find((x:any)=>x.id===e.target.value);updateBlock(di,b.id,{serviceId:e.target.value,department:item?.name||''});}}><option value="">Select from Business Info</option>{services.map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="wide-field assigned-people-field"><span className="field-label">Assigned people</span><div className="assigned-people-chips">{assignedIds(b).map(id=>{const person=people.find((x:any)=>String(x.id)===id);return <span className="assigned-person-chip" key={id}>{person?.name||'Assigned team member'}<button type="button" aria-label={'Remove '+(person?.name||'assigned person')} onClick={()=>updateAssignedPeople(di,b,assignedIds(b).filter(value=>value!==id))}><X size={13}/></button></span>})}</div><select value="" onChange={e=>{const id=e.target.value;if(id)updateAssignedPeople(di,b,[...assignedIds(b),id]);}}><option value="">Add team member…</option>{people.filter((person:any)=>!assignedIds(b).includes(String(person.id))).map((person:any)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></div>
          <label>From<input type="time" value={time24(b.from)} onChange={e=>updateBlock(di,b.id,{from:time12(e.target.value)})}/></label>
          <label>To<input type="time" value={time24(b.to)} onChange={e=>updateBlock(di,b.id,{to:time12(e.target.value)})}/></label>
          <label>Fee (₹)<input type="number" min="0" value={b.fee} onChange={e=>updateBlock(di,b.id,{fee:Number(e.target.value)})}/></label>
        </div>
      </div>)}
      {day.enabled&&day.blocks.length===0&&<div className="empty-block">No shifts saved for this day. Add a working block and select a real department and team member.</div>}
      {!day.enabled&&<div className="empty-block">This day is switched off. Existing saved shifts remain unchanged until you save.</div>}
    </section>)}</div>
    {(!services.length||!people.length)&&<div className="empty-block">Add departments and assigned people in Business Info before creating a bookable shift. No sample staff have been inserted.</div>}
    <div className="appointment-footer"><button className="outline-button" onClick={()=>setShowPreview(!showPreview)}><CalendarDays size={15}/>{showPreview?'Hide slot preview':'Preview available slots'}</button><button className="primary-button" onClick={()=>void onSave()}><Check size={16}/> Save availability</button></div>
    {showPreview&&<section className="panel preview-panel"><h2>Available slot preview</h2><p className="muted-copy">Preview is calculated from the saved working shifts and selected duration.</p>{days.filter((d:Day)=>d.enabled).map((d:Day)=><div className="preview-day" key={d.name}><b>{d.name}</b>{d.blocks.map((b:Block)=><div className="preview-block" key={b.id}><span>{b.department||'Unassigned service'} · {b.doctors.join(', ')||'Unassigned person'}</span><div>{slotsFor(b.from,b.to,Number(slot),Number(buffer)).map(t=><span className="slot-pill" key={t}>{t}</span>)}</div></div>)}</div>)}</section>}
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
  const [exporting,setExporting]=useState('');
  const [exportStatus,setExportStatus]=useState('');
  const bookings=reports?.appointments||{},messages=reports?.messages||{},revenue=reports?.revenue||{},customers=reports?.customers||{},conversations=reports?.conversations||{},ai=reports?.ai_responses||{},conversions=reports?.conversions||{},leads=reports?.leads||{};
  const currency=reports?.currency||'INR';
  const money=(v:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:0}).format(Number.isFinite(Number(v))?Number(v):0);
  const humanResponses=Number(messages.human_replies??Math.max(0,Number(messages.sent||0)-Number(ai.total||0)));
  const conversionRate=Number(leads.total||0)?(Number(conversions.total||0)/Number(leads.total||0))*100:0;
  const aiShare=Number(ai.total||0)+humanResponses?Number(ai.total||0)/(Number(ai.total||0)+humanResponses)*100:0;
  const rows=[
    ['Period (days)',reports?.period_days??period],['Appointments',bookings.total??0],['Pending appointments',bookings.pending??0],['Confirmed appointments',bookings.confirmed??0],['Cancelled appointments',bookings.cancelled??0],['Completed appointments',bookings.completed??0],['Upcoming appointments',bookings.upcoming??0],['Customers',customers.total??0],['Conversations',conversations.total??0],['Leads',leads.total??0],['Converted leads',conversions.total??0],['Lead conversion rate (%)',conversionRate.toFixed(1)],['Revenue collected',revenue.collected_value??0],['Booked value',revenue.booked_value??0],['Customer messages',messages.received??0],['AI responses',ai.total??0],['Human / staff responses',humanResponses],['AI share of staff responses (%)',aiShare.toFixed(1)]
  ];
  const statusRows=Array.isArray(reports?.status_breakdown)?reports.status_breakdown:[];
  const sourceRows=Array.isArray(reports?.source_breakdown)?reports.source_breakdown:[];
  const departmentRows=Array.isArray(reports?.department_breakdown)?reports.department_breakdown:[];
  const dailyRows=Array.isArray(reports?.daily)?reports.daily:[];


  const dailyMax=Math.max(1,...dailyRows.map((x:any)=>Number(x.received_messages||0)));
  const dailyPoints=dailyRows.map((x:any,i:number)=>(dailyRows.length>1?40+i*(520/(dailyRows.length-1)):300)+','+(170-(Number(x.received_messages||0)/dailyMax)*130)).join(' ');
  const aiHandled=Number(ai.total||0),humanHandled=humanResponses,aiReplyShare=aiHandled+humanHandled?Math.round(aiHandled/(aiHandled+humanHandled)*100):0;
  const exportSections:ReportExportSection[]=[
    {title:'Appointments & revenue',rows:rows.map(([label,value]:any)=>({label:String(label),value:String(String(label).toLowerCase().includes('revenue')||String(label).toLowerCase().includes('value')?money(value):value)}))},
    {title:'Appointment status breakdown',rows:statusRows.map((item:any)=>({label:String(item.status||'unknown').replace(/_/g,' '),value:String(item.total??0)}))},
    {title:'Booking sources',rows:sourceRows.map((item:any)=>({label:String(item.source||'unknown'),value:String(item.total??0)}))},
    {title:'AI workload vs human handover',rows:[{label:'AI replies',value:String(Number(ai.total||0))},{label:'Human / staff replies',value:String(humanResponses)},{label:'AI reply share',value:aiShare.toFixed(1)+'%'}]},
    {title:'Department-wise patient flow',rows:departmentRows.map((item:any)=>({label:String(item.department||'Unassigned'),value:String(item.total??0)}))},
    {title:'Daily incoming message volume',rows:dailyRows.map((item:any)=>({label:String(item.day||'Day'),value:String(item.received_messages??0)}))}
  ];
  const runExport=async(format:string,action:()=>Promise<string>)=>{
    if(exporting)return;
    setExporting(format);setExportStatus('Preparing '+format+' report…');
    try{setExportStatus(await action());}
    catch(error){setExportStatus(error instanceof Error?error.message:'Report export failed. Please try again.');}
    finally{setExporting('');}
  };
  const exportSuffix=period.replace(/\s+/g,'-');
  const donutColors:any={confirmed:'#16a34a',pending:'#f59e0b',cancelled:'#ef4444',no_show:'#7c3aed',completed:'#0d9488',rescheduled:'#3b82f6'};
  let donutCursor=0;
  const donutStops=statusRows.map((item:any)=>{const pct=Number(bookings.total||0)?Number(item.total||0)/Number(bookings.total)*100:0;const start=donutCursor;donutCursor+=pct;return (donutColors[String(item.status||'').toLowerCase()]||'#94a3b8')+' '+start+'% '+donutCursor+'%';}).join(',');
  const chartValues=statusRows.map((x:any)=>({label:String(x.status||'Other').replace(/_/g,' '),value:Number(x.total||0)}));
  const maxChart=Math.max(1,...chartValues.map((x:any)=>x.value));
  return <section className="panel module-panel">
    <div className="toolbar"><div><h2>Performance overview</h2><p>Metrics from this organisation's live database.</p></div><select value={period} onChange={e=>setPeriod(e.target.value)}><option>7 days</option><option>30 days</option><option>90 days</option></select></div>
    {exportStatus&&<p className="muted-copy" role="status" aria-live="polite">{exportStatus}</p>}
    {!reports?<div className="empty-block">Report data is not available yet. It will load automatically when the next workspace sync completes.</div>:<>
      <div className="stats-grid report-metrics">
        <Metric icon={CalendarCheck} label="Appointments" value={String(bookings.total??0)} change="Live" detail={period}/>
        <Metric icon={Users} label="Customers" value={String(customers.total??0)} change="Live" detail="workspace total"/>
        <Metric icon={TrendingUp} label="Conversion rate" value={conversionRate.toFixed(1)+'%'} change="Live" detail="converted leads / new leads"/>
        <Metric icon={Bot} label="AI responses" value={String(ai.total??0)} change="Live" detail="AI sent messages"/>
        <Metric icon={MessageCircle} label="Human responses" value={String(humanResponses)} change="Live" detail="staff sent messages"/>
      </div>
      <div className="panel-inner report-data-panel">
        <div className="section-title inside"><div><h3>Appointments & revenue</h3><p>Real totals for the selected reporting period.</p></div><details className="report-export-menu"><summary className="outline-button"><Download size={14}/> Export Report</summary><div className="report-export-options"><button type="button" disabled={!!exporting} onClick={()=>void runExport('PDF',()=>exportReportPdf('hupera-report-'+exportSuffix+'.pdf','Hupera AI — Workspace Report',period+' · Live workspace data',exportSections))}><FileText size={14}/> {exporting==='PDF'?'Preparing PDF…':'Export as PDF'}</button><button type="button" disabled={!!exporting} onClick={()=>void runExport('CSV',()=>exportReportCsv('hupera-report-'+exportSuffix+'.csv',exportSections))}><Download size={14}/> {exporting==='CSV'?'Preparing CSV…':'Export as CSV / Excel'}</button><button type="button" disabled={!!exporting} onClick={()=>void runExport('PNG',()=>exportReportPng('hupera-report-'+exportSuffix+'.png','Hupera AI — Workspace Report',period+' · Live workspace data',exportSections))}><Download size={14}/> {exporting==='PNG'?'Preparing PNG…':'Download as PNG'}</button></div></details></div>
        {rows.map(([label,value])=><div className="summary-line" key={String(label)}><div><small>{label}</small><b>{String(label).toLowerCase().includes('revenue')||String(label).toLowerCase().includes('value')?money(value):String(value)}</b></div></div>)}
      </div>
      <div className="report-visual-card"><div className="section-title inside"><div><h3>Workspace performance</h3><p>Visualised from live reporting totals.</p></div></div><svg id="hupera-report-visual" className="report-svg" viewBox="0 0 1200 560" role="img" aria-label="Appointment status bars and AI versus team response line"><rect width="1200" height="560" rx="24" fill="#f7f9ff"/><text x="48" y="54" fontSize="25" fontWeight="700" fill="#1b2a44">Appointment status</text>{chartValues.slice(0,6).map((v:any,i:number)=><g key={v.label}><text x="48" y={112+i*58} fontSize="18" fill="#52627a">{v.label}</text><rect x="260" y={91+i*58} width="650" height="25" rx="12" fill="#e4eaf5"/><rect x="260" y={91+i*58} width={650*v.value/maxChart} height="25" rx="12" fill="#3976d7"/><text x="930" y={112+i*58} fontSize="18" fontWeight="700" fill="#1b2a44">{v.value}</text></g>)}<text x="48" y="475" fontSize="25" fontWeight="700" fill="#1b2a44">AI vs team responses</text><path d="M300 470 L650 390 L1000 470" fill="none" stroke="#12a37a" strokeWidth="5" strokeLinecap="round"/><circle cx="300" cy="470" r="10" fill="#3976d7"/><circle cx="650" cy="390" r="10" fill="#12a37a"/><circle cx="1000" cy="470" r="10" fill="#3976d7"/><text x="270" y="525" fontSize="18" fill="#52627a">AI {Number(ai.total||0)}</text><text x="600" y="355" fontSize="18" fill="#52627a">Combined responses {Number(ai.total||0)+humanResponses}</text><text x="950" y="525" fontSize="18" fill="#52627a">Team {humanResponses}</text></svg></div>
      <div className="report-grid" style={{marginTop:16}}>
        <div className="panel-inner"><h3>Appointment status breakdown</h3>{statusRows.length?statusRows.map((item:any)=><div className="summary-line" key={item.status}><div><small>{String(item.status||'unknown').replace(/_/g,' ')}</small><b>{item.total}</b></div></div>):<p>No appointment status data for this period.</p>}</div>
        <div className="panel-inner"><h3>Booking sources</h3>{sourceRows.length?sourceRows.map((item:any)=><div className="summary-line" key={item.source}><div><small>{item.source||'unknown'}</small><b>{item.total}</b></div></div>):<p>No booking source data for this period.</p>}</div>
      </div>
      <div className="report-grid report-insights">
        <section className="panel-inner insight-card"><div className="insight-heading"><div><h3>Appointment status</h3><p>Confirmed, pending, cancelled and completed</p></div><CalendarCheck size={18}/></div><div className="donut-layout"><div className="donut-ring" style={{background:donutStops?'conic-gradient('+donutStops+')':'#e8edf4'}}><div><b>{bookings.total||0}</b><small>Total</small></div></div><div className="donut-legend">{statusRows.map((item:any)=><div key={item.status}><i style={{background:donutColors[String(item.status||'').toLowerCase()]||'#94a3b8'}}/><span>{String(item.status||'Other').replace(/_/g,' ')}</span><b>{item.total}</b></div>)}</div></div></section>
        <section className="panel-inner insight-card"><div className="insight-heading"><div><h3>AI workload vs human handover</h3><p>Reply volume share, not inferred conversation closure</p></div><Bot size={18}/></div><div className="workload-value">{aiReplyShare}% <small>AI reply share</small></div><div className="workload-track"><span style={{width:aiReplyShare+'%'}}/></div><div className="workload-legend"><span>🤖 AI replies <b>{aiHandled}</b></span><span>👤 Human replies <b>{humanHandled}</b></span></div></section>
        <section className="panel-inner insight-card"><div className="insight-heading"><div><h3>Department-wise patient flow</h3><p>Appointment volume by service / department</p></div><Stethoscope size={18}/></div>{departmentRows.length?departmentRows.map((item:any)=><div className="department-bar" key={item.department}><div><span>{item.department}</span><b>{item.total}</b></div><i><span style={{width:(Number(item.total||0)/Math.max(1,...departmentRows.map((x:any)=>Number(x.total||0)))*100)+'%'}}/></i></div>):<p>Department-level data is not available yet.</p>}</section>
        <section className="panel-inner insight-card"><div className="insight-heading"><div><h3>Daily message volume</h3><p>Incoming customer messages · {period}</p></div><MessageCircle size={18}/></div>{dailyRows.length?<svg className="daily-volume-chart" viewBox="0 0 600 210" role="img" aria-label="Daily incoming message volume"><path d="M40 170 H560" stroke="#e2e8f0" strokeWidth="2"/><polyline points={dailyPoints} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{dailyRows.map((item:any,i:number)=><circle key={item.day} cx={dailyRows.length>1?40+i*(520/(dailyRows.length-1)):300} cy={170-(Number(item.received_messages||0)/dailyMax)*130} r="4" fill="#16a34a"/>)}<text x="40" y="198" fontSize="12" fill="#64748b">{dailyRows[0]?.day||''}</text><text x="560" y="198" textAnchor="end" fontSize="12" fill="#64748b">{dailyRows[dailyRows.length-1]?.day||''}</text></svg>:<p>Daily message trend is not available yet.</p>}</section>
      </div>
    </>}
  </section>;
}

function SettingsPage({employees,section,setSection,onLogout,theme,toggleTheme,enableAlerts,settingsData,saving,onSave,alertsEnabled,pushPermission,nativePlatform}:{employees:any[];section:string;setSection:(s:string)=>void;onLogout:()=>void;theme:'light'|'dark';toggleTheme:()=>void;enableAlerts:()=>void;settingsData:any;saving:boolean;onSave:(organization:any,preferences:any)=>void;alertsEnabled:boolean;pushPermission:string;nativePlatform:boolean}) {
  const items=[['Business profile','Business details'],['WhatsApp integration','Connected channel status'],['AI Workforce','Configured AI employees'],['Payments','Payment connection status'],['Team & permissions','Workspace access'],['Notifications','Device alerts and preferences'],['Appearance','App theme'],['Google Calendar','Calendar connection status'],['Billing & support','Plan and account']];
  const org=settingsData?.organization||{},prefs=settingsData?.preferences||{},integrations=settingsData?.integrations||{};
  const [draft,setDraft]=useState<any>({});
  const [preferences,setPreferences]=useState<any>({});
  useEffect(()=>{setDraft({name:org.name||'',industry:org.industry||'',country:org.country||'',timezone:org.timezone||'Asia/Kolkata',currency:org.currency||'INR',website:org.website||'',description:org.description||'',notification_email:org.notification_email||'',business_phone:org.business_phone||''});setPreferences({...prefs});},[settingsData]);
  const status=(value:any)=>value?.status||'Not connected';
  return <section className="panel module-panel">
    <div className="toolbar"><div><h2>Workspace settings</h2><p>Settings are loaded from the authenticated organisation.</p></div></div>
    <div className="settings-layout">
      <div className="settings-menu">{items.map(([a,b])=><button type="button" className={section===a?'active':''} key={a} onClick={()=>setSection(a)}><span><b>{a}</b><small>{b}</small></span><ChevronRight size={15}/></button>)}</div>
      <div className="settings-detail">
        <div className="settings-detail-icon"><Settings size={20}/></div><h3>{section}</h3>
        {section==='Business profile'&&<><p>Edit business information saved to the signed-in organisation.</p>
          {([['name','Business name'],['industry','Industry'],['country','Country'],['timezone','Timezone'],['currency','Currency'],['website','Website'],['description','Business description'],['notification_email','Notification email'],['business_phone','Business phone']] as const).map(([key,label])=><label key={key}>{label}<input value={draft[key]||''} onChange={e=>setDraft((old:any)=>({...old,[key]:e.target.value}))}/></label>)}
          <button className="primary-button" disabled={saving||!settingsData} onClick={()=>onSave(draft,preferences)}>{saving?'Saving…':'Save business profile'}</button>
        </>}
        {section==='WhatsApp integration'&&<><p>WhatsApp credentials remain protected on the server. This view shows the live connection without exposing access tokens.</p><div className="integration-state"><MessageCircle/><div><b>{status(integrations.whatsapp)}</b><small>{integrations.whatsapp?.verified_name||integrations.whatsapp?.display_phone_number||'No connected WhatsApp sender is available.'}</small></div></div><div className="summary-line"><div><small>Last updated</small><b>{integrations.whatsapp?.updated_at?new Date(integrations.whatsapp.updated_at).toLocaleString('en-IN'):'—'}</b></div></div></>}
        {section==='AI Workforce'&&<><p>Manage AI employees enabled for this workspace. Status is synced from your organisation.</p>{employees.length?employees.map((employee:any)=><div className="integration-state" key={employee.id}><Bot/><div><b>{employee.name||employee.employee_type||'AI employee'}</b><small>{employee.description||employee.employee_type||'Workspace AI employee'} · {employee.status||'Status unavailable'}</small></div></div>):<div className="empty-block">No AI employees are configured for this workspace yet.</div>}<div className="summary-line"><div><small>AI approval required</small><b>{preferences.ai_approval_required===false?'No':'Yes'}</b></div><input aria-label="AI approval required" type="checkbox" checked={preferences.ai_approval_required!==false} onChange={e=>setPreferences((old:any)=>({...old,ai_approval_required:e.target.checked}))}/></div><button className="primary-button" disabled={saving} onClick={()=>onSave({},preferences)}>Save AI preferences</button></>}
        {section==='Payments'&&<><p>Payment provider state is read from your workspace. Provider secrets are never displayed in the mobile app.</p>{(integrations.payments||[]).length?(integrations.payments||[]).map((item:any,i:number)=><div className="integration-state" key={i}><Wallet/><div><b>{item.provider||'Payment provider'} · {item.status||'Unknown'}</b><small>{item.updated_at?new Date(item.updated_at).toLocaleString('en-IN'):''}</small></div></div>):<div className="empty-block">No payment connection record was returned for this organisation.</div>}</>}
        {section==='Team & permissions'&&<><p>Current role for this authenticated workspace.</p><div className="summary-line"><div><small>Workspace role</small><b>{org.role||'Workspace member'}</b></div></div><div className="summary-line"><div><small>Business workspace</small><b>{org.name||'—'}</b></div></div><p>Team invitations and role changes require the organisation's team-management permission API, which is not exposed to this mobile session yet.</p></>}
        {section==='Notifications'&&<><p>Enable native Firebase push alerts on this Android device. Notifications are delivered to the app, not through browser alerts.</p><button className="primary-button" onClick={()=>void enableAlerts()}><Bell size={15}/> {alertsEnabled?'Re-register this device':'Enable device alerts'}</button><div className="summary-line"><div><small>Device permission</small><b>{nativePlatform?(pushPermission==='registered'?'Allowed · device registered':pushPermission==='granted'?'Allowed · registering':pushPermission==='denied'?'Blocked in Android settings':pushPermission==='registration_failed'?'Registration failed':pushPermission):typeof Notification!=='undefined'?Notification.permission:'Not supported'}</b></div></div><div className="summary-line"><div><small>Email notifications</small><b>{preferences.email_notifications===false?'Off':'On'}</b></div><input type="checkbox" checked={preferences.email_notifications!==false} onChange={e=>setPreferences((old:any)=>({...old,email_notifications:e.target.checked}))}/></div><div className="summary-line"><div><small>Task alerts</small><b>{preferences.task_alerts===false?'Off':'On'}</b></div><input type="checkbox" checked={preferences.task_alerts!==false} onChange={e=>setPreferences((old:any)=>({...old,task_alerts:e.target.checked}))}/></div><button className="primary-button" disabled={saving} onClick={()=>onSave({},preferences)}>Save notification preferences</button></>}
        {section==='Appearance'&&<><p>Choose the appearance of this app on this device.</p><div className="summary-line"><div><small>Current theme</small><b>{theme==='dark'?'Dark':'Light'}</b></div></div><button className="outline-button" onClick={toggleTheme}>{theme==='dark'?'Switch to light theme':'Switch to dark theme'}</button><div className="summary-line"><div><small>Compact mode</small><b>{preferences.compact_mode?'On':'Off'}</b></div><input type="checkbox" checked={!!preferences.compact_mode} onChange={e=>setPreferences((old:any)=>({...old,compact_mode:e.target.checked}))}/></div><button className="primary-button" disabled={saving} onClick={()=>onSave({},preferences)}>Save appearance preferences</button></>}
        {section==='Google Calendar'&&<><p>Calendar integration status for this workspace.</p><div className="integration-state"><CalendarCheck/><div><b>{integrations.calendar?.connected_email?'Connected':'Not connected'}</b><small>{integrations.calendar?.connected_email||'No Google Calendar account is connected.'}</small></div></div></>}
        {section==='Billing & support'&&<><p>Billing and subscription information is protected by the workspace account.</p><div className="empty-block">Billing details are not exposed through the mobile settings API. No external browser redirect is triggered.</div></>}
        <div style={{marginTop:28,paddingTop:20,borderTop:'1px solid var(--settings-divider, #e5eaf1)'}}><h3 style={{marginTop:0}}>Account</h3><p>Sign out and clear the Hupera mobile session.</p><button className="danger-button" onClick={onLogout}><LogOut size={16}/> Logout</button></div>
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
      try {
        localStorage.removeItem('hupera_mobile_access_token');
        localStorage.removeItem('hupera_access_token');
      } catch {
        // Capacitor Preferences token is already cleared above.
      }

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
