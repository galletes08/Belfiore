import {useEffect} from 'react';
import {subscribeOperationsRefresh} from '../utils/operationsSync';
export default function useOperationsSync(refresh,enabled=true){
 useEffect(()=>{
  if(!enabled)return;
  return subscribeOperationsRefresh(refresh);
 },[refresh,enabled]);
}
