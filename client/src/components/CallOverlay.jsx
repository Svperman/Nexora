import { useEffect, useRef } from 'react';
import { useCall } from '../store/call.js';
import { useT } from '../i18n.js';

function Video({ stream, muted, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

export default function CallOverlay() {
  const t = useT();
  const call = useCall();

  useEffect(() => {
    if (!call.notice) return;
    const timer = setTimeout(call.dismissNotice, 4000);
    return () => clearTimeout(timer);
  }, [call.notice, call.dismissNotice]);

  if (call.status === 'idle') {
    return call.notice ? <div className="toast" role="status">{t(call.notice.key, call.notice.vars)}</div> : null;
  }

  const name = call.peer?.username ?? '…';
  const title = {
    incoming: t('call.incoming', { name, kind: t(call.video ? 'call.video' : 'call.audio') }),
    outgoing: t('call.outgoing', { name }),
    connecting: t('call.connecting'),
    active: name,
  }[call.status];

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="call-stage">
        {call.video ? (
          <>
            <Video stream={call.remoteStream} className="remote" />
            {call.localStream && <Video stream={call.localStream} muted className="local" />}
          </>
        ) : (
          <>
            <div className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
            {/* Audio seul : l'élément vidéo joue quand même le son distant */}
            <Video stream={call.remoteStream} className="hidden" />
          </>
        )}
        <p className="call-title">{title}</p>
      </div>
      <div className="call-controls">
        {call.status === 'incoming' ? (
          <>
            <button className="accept" onClick={call.accept}>{t('call.accept')}</button>
            <button className="hangup" onClick={call.decline}>{t('call.decline')}</button>
          </>
        ) : (
          <>
            <button className="ghost light" onClick={call.toggleMute} aria-pressed={call.muted}>
              {call.muted ? t('call.unmute') : t('call.mute')}
            </button>
            {call.video && (
              <button className="ghost light" onClick={call.toggleCamera} aria-pressed={call.cameraOff}>
                {call.cameraOff ? t('call.cameraOn') : t('call.cameraOff')}
              </button>
            )}
            <button className="hangup" onClick={() => call.hangup()}>{t('call.hangup')}</button>
          </>
        )}
      </div>
    </div>
  );
}
