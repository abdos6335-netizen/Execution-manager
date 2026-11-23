/* Wathiq Cloud Sync — Firebase compat SDK */
(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyCqoP1UI7YtObg1BLTnPNjI7GF_ONhLOUQ",
    authDomain: "execution-manager-7a22f.firebaseapp.com",
    projectId: "execution-manager-7a22f",
    storageBucket: "execution-manager-7a22f.firebasestorage.app",
    messagingSenderId: "282864760763",
    appId: "1:282864760763:web:551a4afbeba97d3224b69e"
  };

  let auth = null, db = null, user = null, workspaceRef = null;
  let unsubscribe = null, debounceTimer = null;
  let ready = false, pendingLocal = false, conflict = false;
  let lastRevision = 0, conflictRevision = 0, latestRemoteState = null;
  let initialized = false;

  const $ = id => document.getElementById(id);
  const bridge = () => window.WathiqAppBridge;

  function setStatus(message, kind = 'info') {
    const node = $('cloudSyncStatus');
    if (node) {
      node.textContent = message;
      node.dataset.state = kind;
    }
    const label = $('cloudUserLabel');
    if (label) label.textContent = user ? (user.displayName || user.email || 'حساب Google متصل') : 'لم يتم تسجيل الدخول';
    const signIn = $('cloudSignIn');
    const signOut = $('cloudSignOut');
    const syncNow = $('cloudSyncNow');
    if (signIn) signIn.classList.toggle('hidden', !!user);
    if (signOut) signOut.classList.toggle('hidden', !user);
    if (syncNow) syncNow.classList.toggle('hidden', !user);
    ['cloudUseRemote', 'cloudOverwriteRemote'].forEach(id => {
      const button = $(id);
      if (button) button.classList.toggle('hidden', !conflict);
    });
  }

  function hasLocalData(state) {
    if (!state || typeof state !== 'object') return false;
    const arrays = Object.keys(state).filter(key => key !== 'projects' && Array.isArray(state[key]));
    if (arrays.some(key => state[key].length > 0)) return true;
    return Array.isArray(state.projects) && state.projects.some(p =>
      p && (p.id !== 'p1' || p.name !== 'المشروع الأول' || Number(p.rate) !== 10)
    );
  }

  function mergeStates(localState, remoteState) {
    const local = localState && typeof localState === 'object' ? localState : {};
    const remote = remoteState && typeof remoteState === 'object' ? remoteState : {};
    const merged = { ...local, ...remote };
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const a = local[key], b = remote[key];
      if (!Array.isArray(a) && !Array.isArray(b)) continue;
      if (!Array.isArray(a)) { merged[key] = b; continue; }
      if (!Array.isArray(b)) { merged[key] = a; continue; }
      const records = new Map();
      a.forEach((item, index) => {
        if (item && typeof item === 'object') records.set(String(item.id || 'local:' + index + ':' + JSON.stringify(item)), item);
      });
      b.forEach((item, index) => {
        if (item && typeof item === 'object') records.set(String(item.id || 'remote:' + index + ':' + JSON.stringify(item)), item);
      });
      merged[key] = [...records.values()];
    }
    if (Array.isArray(merged.projects) && !merged.projects.some(p => p.id === merged.current)) {
      merged.current = merged.projects[0]?.id || '';
    }
    return merged;
  }

  function stateSizeBytes(state) {
    return new TextEncoder().encode(JSON.stringify(state)).length;
  }

  function applyRemoteState(state) {
    if (!state || typeof state !== 'object' || !bridge()) throw new Error('بيانات السحابة غير صالحة');
    bridge().applyRemoteState(state);
  }

  async function writeState(state, expectedRevision, force = false) {
    if (!workspaceRef || !user) throw new Error('يجب تسجيل الدخول أولاً');
    const cloudState = JSON.parse(JSON.stringify(state));
    if (stateSizeBytes(cloudState) > 900 * 1024) throw new Error('حجم البيانات أكبر من الحد الآمن لمستند Firestore. نحتاج تقسيم البيانات إلى مستندات متعددة قبل المزامنة.');
    let writtenRevision = 0;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(workspaceRef);
      const actualRevision = snapshot.exists ? Number(snapshot.data().revision || 0) : 0;
      if (!force && actualRevision !== expectedRevision) {
        const error = new Error('SYNC_CONFLICT');
        error.code = 'sync/conflict';
        throw error;
      }
      writtenRevision = actualRevision + 1;
      transaction.set(workspaceRef, {
        schemaVersion: 1,
        revision: writtenRevision,
        state: cloudState,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid
      });
    });
    lastRevision = writtenRevision;
    pendingLocal = false;
    conflict = false;
    latestRemoteState = null;
    setStatus('تمت مزامنة البيانات بنجاح', 'success');
  }

  async function initializeWorkspace() {
    if (!bridge()) {
      setStatus('تعذر تحميل واجهة البرنامج. أعد تحميل الصفحة.', 'error');
      return;
    }
    workspaceRef = db.collection('users').doc(user.uid).collection('workspaces').doc('main');
    ready = false;
    const snapshot = await workspaceRef.get();
    const localState = bridge().getState();

    if (!snapshot.exists) {
      await writeState(localState, 0, true);
    } else {
      const remote = snapshot.data() || {};
      const remoteState = remote.state;
      if (!remoteState || typeof remoteState !== 'object') throw new Error('مستند السحابة لا يحتوي على نسخة بيانات صالحة.');
      lastRevision = Number(remote.revision || 1);

      if (hasLocalData(localState)) {
        const merge = window.confirm(
          'وجدنا بيانات محفوظة على هذا الجهاز وبيانات أخرى في السحابة.\n\n' +
          'اضغط موافق لدمج السجلات غير المتكررة. عند وجود نفس معرّف السجل في النسختين سنحتفظ بنسخة السحابة.\n' +
          'اضغط إلغاء لإيقاف الربط الآن دون تغيير أي بيانات.'
        );
        if (!merge) {
          setStatus('المزامنة متوقفة لحماية البيانات المحلية. لم يتم استبدال أي بيانات.', 'warning');
          return;
        }
        const combined = mergeStates(localState, remoteState);
        applyRemoteState(combined);
        await writeState(combined, lastRevision, false);
      } else {
        applyRemoteState(remoteState);
        setStatus('تم تحميل بيانات حسابك من السحابة', 'success');
      }
    }

    ready = true;
    pendingLocal = false;
    conflict = false;
    startRealtimeListener();
    setStatus('متصل — المزامنة الفورية مفعّلة', 'success');
  }

  function startRealtimeListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = workspaceRef.onSnapshot(snapshot => {
      if (!snapshot.exists) return;
      const data = snapshot.data() || {};
      const revision = Number(data.revision || 0);
      if (revision <= lastRevision) return;
      const active = document.activeElement;
      const editing = !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '');
      if (pendingLocal || editing) {
        conflict = true;
        conflictRevision = revision;
        latestRemoteState = data.state || null;
        setStatus('يوجد تعديل من جهاز آخر بالتزامن مع تعديلاتك. اختر طريقة حل التعارض قبل المتابعة.', 'warning');
        return;
      }
      try {
        applyRemoteState(data.state);
        lastRevision = revision;
        setStatus('وصل تحديث جديد من جهازك الآخر', 'success');
      } catch (error) {
        console.error('Remote state was not applied:', error);
        setStatus('وصلت بيانات سحابية غير صالحة ولم يتم تطبيقها.', 'error');
      }
    }, error => {
      console.error('Firestore listener error:', error);
      setStatus('تعذرت متابعة المزامنة: ' + (error.message || error.code || 'خطأ غير معروف'), 'error');
    });
  }

  async function captureConflictSnapshot() {
    if (!workspaceRef) return;
    const snapshot = await workspaceRef.get();
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    conflictRevision = Number(data.revision || 0);
    latestRemoteState = data.state || null;
  }

  function localChanged(state) {
    if (!ready || !user || !workspaceRef) return;
    pendingLocal = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (conflict) return;
      try {
        await writeState(state, lastRevision, false);
      } catch (error) {
        if (error.code === 'sync/conflict') {
          conflict = true;
          try { await captureConflictSnapshot(); } catch (snapshotError) { console.warn('Could not load conflicting cloud version:', snapshotError); }
          setStatus('تعارض بين تعديلات الجهازين. لم نكتب فوق بيانات السحابة.', 'warning');
        } else {
          setStatus('تعذرت المزامنة: ' + (error.message || error.code || 'خطأ غير معروف'), 'error');
        }
        console.error('Cloud sync write failed:', error);
      }
    }, 800);
  }

  async function useRemoteVersion() {
    if (!conflict || !latestRemoteState) return;
    if (!window.confirm('سيتم استبدال بيانات هذا الجهاز بآخر نسخة سحابية. تأكد من تصدير نسخة احتياطية إذا كانت لديك تعديلات غير متزامنة. هل تريد المتابعة؟')) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    applyRemoteState(latestRemoteState);
    lastRevision = conflictRevision;
    pendingLocal = false;
    conflict = false;
    latestRemoteState = null;
    setStatus('تم اعتماد نسخة السحابة على هذا الجهاز', 'success');
  }

  async function overwriteRemoteVersion() {
    if (!conflict) return;
    if (!window.confirm('سيتم رفع بيانات هذا الجهاز فوق النسخة السحابية الحالية. قد يؤدي ذلك إلى استبدال تعديلات الجهاز الآخر. هل أنت متأكد؟')) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    try {
      await writeState(bridge().getState(), conflictRevision, true);
      startRealtimeListener();
    } catch (error) {
      setStatus('تعذر رفع النسخة المحلية: ' + (error.message || error.code), 'error');
    }
  }

  async function signIn() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
    } catch (error) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(error.code)) {
        await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
        return;
      }
      setStatus('تعذر تسجيل الدخول: ' + (error.message || error.code), 'error');
      console.error('Google sign-in failed:', error);
    }
  }

  async function signOut() {
    if (!window.confirm('تسجيل الخروج لن يحذف بيانات هذا الجهاز أو بيانات السحابة. هل تريد المتابعة؟')) return;
    try { await auth.signOut(); }
    catch (error) { setStatus('تعذر تسجيل الخروج: ' + (error.message || error.code), 'error'); }
  }

  async function syncNow() {
    if (!user) return;
    if (!ready) {
      setStatus('جاري إعادة محاولة تجهيز المزامنة…', 'info');
      try { await initializeWorkspace(); }
      catch (error) { setStatus('تعذرت إعادة المحاولة: ' + (error.message || error.code), 'error'); }
      return;
    }
    if (conflict) {
      setStatus('اختر أولاً: استخدام نسخة السحابة أو رفع نسخة هذا الجهاز.', 'warning');
      return;
    }
    try {
      await writeState(bridge().getState(), lastRevision, false);
    } catch (error) {
      if (error.code === 'sync/conflict') {
        conflict = true;
        try { await captureConflictSnapshot(); } catch (snapshotError) { console.warn('Could not load conflicting cloud version:', snapshotError); }
        setStatus('وجدنا تعديلاً أحدث في السحابة. لم نستبدل أي بيانات.', 'warning');
      } else setStatus('تعذرت المزامنة: ' + (error.message || error.code), 'error');
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (!window.firebase || !window.firebase.initializeApp) {
      setStatus('تعذر تحميل Firebase SDK. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.', 'error');
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(error => console.warn('Auth persistence:', error));
      $('cloudSignIn')?.addEventListener('click', signIn);
      $('cloudSignOut')?.addEventListener('click', signOut);
      $('cloudSyncNow')?.addEventListener('click', syncNow);
      $('cloudUseRemote')?.addEventListener('click', useRemoteVersion);
      $('cloudOverwriteRemote')?.addEventListener('click', overwriteRemoteVersion);
      auth.getRedirectResult().catch(error => {
        if (error) setStatus('تعذر إكمال تسجيل الدخول: ' + (error.message || error.code), 'error');
      });
      window.addEventListener('online', () => {
        if (user && ready && !conflict) syncNow();
      });
      auth.onAuthStateChanged(async nextUser => {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        user = nextUser;
        ready = false;
        workspaceRef = null;
        pendingLocal = false;
        conflict = false;
        latestRemoteState = null;
        if (!user) {
          setStatus('البيانات محفوظة محلياً. سجّل بحساب Google لتفعيل المزامنة بين الأجهزة.', 'info');
          return;
        }
        setStatus('تم تسجيل الدخول. جاري تجهيز مساحة المزامنة…', 'info');
        try {
          await initializeWorkspace();
        } catch (error) {
          console.error('Cloud workspace initialization failed:', error);
          setStatus('تعذر تجهيز المزامنة: ' + (error.message || error.code || 'خطأ غير معروف'), 'error');
        }
      });
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      setStatus('تعذر تهيئة Firebase: ' + (error.message || error.code), 'error');
    }
  }

  window.WathiqCloudSync = { init, localChanged, syncNow, mergeStates, hasLocalData };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
