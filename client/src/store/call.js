// Appels audio/vidéo 1-à-1 en WebRTC. Signalisation via Socket.IO (call:offer/answer/ice/reject/end).
import { create } from 'zustand';
import { api } from '../api.js';
import { useRealtime } from './realtime.js';

const RING_TIMEOUT_MS = 30_000;
let pc = null;
let pendingIce = [];
let ringTimer = null;
let iceConfig = null;

const initial = {
  status: 'idle', // idle | outgoing | incoming | connecting | active
  callId: null, peer: null, video: false, offer: null,
  localStream: null, remoteStream: null, muted: false, cameraOff: false, notice: null,
};

const emit = (event, data) => useRealtime.getState().socket?.emitWithAck(event, data);

async function getIceServers() {
  if (!iceConfig) iceConfig = await api('/rtc/config').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
  return iceConfig.iceServers;
}

export const useCall = create((set, get) => {
  function cleanup(notice = null) {
    clearTimeout(ringTimer);
    get().localStream?.getTracks().forEach((t) => t.stop());
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null;
      pc.close();
    }
    pc = null;
    pendingIce = [];
    set({ ...initial, notice });
  }

  async function createPeer(video) {
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 1280, height: 720 } : false });
    const { callId, peer } = get();
    pc = new RTCPeerConnection({ iceServers: await getIceServers() });
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    const remoteStream = new MediaStream();
    pc.ontrack = (e) => e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    pc.onicecandidate = (e) => e.candidate && emit('call:ice', { to: peer.id, callId, candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'connected') set({ status: 'active' });
      if (pc?.connectionState === 'failed') get().hangup({ key: 'call.failed' });
    };
    set({ localStream, remoteStream });
  }

  async function flushIce() {
    for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => {});
    pendingIce = [];
  }

  return {
    ...initial,

    async start(peer, video) {
      if (get().status !== 'idle') return;
      set({ ...initial, status: 'outgoing', callId: crypto.randomUUID(), peer, video });
      try {
        await createPeer(video);
      } catch {
        return cleanup({ key: 'call.noMedia' });
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await emit('call:offer', { to: peer.id, callId: get().callId, video, description: pc.localDescription.toJSON() });
      if (res?.error) return cleanup({ key: 'call.offline', vars: { name: peer.username } });
      ringTimer = setTimeout(() => get().hangup({ key: 'call.declined', vars: { name: peer.username } }), RING_TIMEOUT_MS);
    },

    async accept() {
      const { offer, video } = get();
      if (get().status !== 'incoming') return;
      clearTimeout(ringTimer);
      set({ status: 'connecting' });
      try {
        await createPeer(video);
      } catch {
        await emit('call:reject', { to: get().peer.id, callId: get().callId, reason: 'declined' });
        return cleanup({ key: 'call.noMedia' });
      }
      await pc.setRemoteDescription(offer);
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await emit('call:answer', { to: get().peer.id, callId: get().callId, description: pc.localDescription.toJSON() });
    },

    async decline() {
      const { peer, callId } = get();
      if (peer) await emit('call:reject', { to: peer.id, callId, reason: 'declined' });
      cleanup();
    },

    async hangup(notice = { key: 'call.ended' }) {
      const { peer, callId, status } = get();
      if (peer && status !== 'idle') await emit('call:end', { to: peer.id, callId });
      cleanup(notice);
    },

    toggleMute() {
      const muted = !get().muted;
      get().localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
      set({ muted });
    },
    toggleCamera() {
      const cameraOff = !get().cameraOff;
      get().localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
      set({ cameraOff });
    },
    dismissNotice: () => set({ notice: null }),

    /** Branche les événements de signalisation sur la socket ; renvoie la fonction de nettoyage. */
    bind(socket) {
      const handlers = {
        'call:offer': async ({ from, fromName, callId, video, description }) => {
          if (get().status !== 'idle') {
            return socket.emitWithAck('call:reject', { to: from, callId, reason: 'busy' });
          }
          set({ ...initial, status: 'incoming', callId, video, offer: description, peer: { id: from, username: fromName } });
          ringTimer = setTimeout(() => cleanup(), RING_TIMEOUT_MS);
        },
        'call:answer': async ({ callId, description }) => {
          if (callId !== get().callId || !pc) return;
          clearTimeout(ringTimer);
          set({ status: 'connecting' });
          await pc.setRemoteDescription(description);
          await flushIce();
        },
        'call:ice': async ({ callId, candidate }) => {
          if (callId !== get().callId) return;
          if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
          else pendingIce.push(candidate);
        },
        'call:reject': ({ callId, reason }) => {
          if (callId !== get().callId) return;
          const name = get().peer?.username;
          cleanup({ key: reason === 'busy' ? 'call.busy' : 'call.declined', vars: { name } });
        },
        'call:end': ({ callId }) => callId === get().callId && cleanup({ key: 'call.ended' }),
      };
      for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
      return () => {
        for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
      };
    },
  };
});
