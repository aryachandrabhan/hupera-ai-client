import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import App from './App';
import './styles.css';

const routeFromNotification=(data:any)=>{
  const payload=data||{};
  (window as any).__huperaPendingPush=payload;
  window.dispatchEvent(new CustomEvent('hupera:push-open',{detail:payload}));
};
if(Capacitor.isNativePlatform()){
  void PushNotifications.addListener('pushNotificationActionPerformed',event=>{
    routeFromNotification(event?.notification?.data||{});
  });
  void LocalNotifications.addListener('localNotificationActionPerformed',event=>{
    routeFromNotification(event?.notification?.extra||{});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
