import React, { useEffect, useState } from 'react';
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit';

export function WorldIDButton({ onVerify, onError }) {
  const [config, setConfig] = useState(null);
  const [rpContext, setRpContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/world/config', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => onError('Could not load World ID configuration'))
      .finally(() => setLoading(false));
  }, [onError]);

  const startVerification = async () => {
    if (!config || !config.configured) {
      onError('World ID is not configured. Add WORLD_ID_APP_ID, WORLD_ID_RP_ID, and WORLD_ID_SIGNING_KEY on the backend.');
      return;
    }

    setRequesting(true);
    onError('');
    try {
      const response = await fetch('/api/world/rp-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: config.action }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not start World ID verification');
      }
      setRpContext({
        rp_id: data.rp_id,
        nonce: data.nonce,
        created_at: data.created_at,
        expires_at: data.expires_at,
        signature: data.sig,
      });
      setOpen(true);
    } catch (err) {
      onError(err.message);
    } finally {
      setRequesting(false);
    }
  };

  const handleVerify = async (idkitResponse) => {
    const response = await fetch('/api/world/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idkitResponse }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'World ID verification failed');
    }
    onVerify(data);
  };

  if (loading) {
    return <button disabled>Loading World ID...</button>;
  }

  return (
    <>
      <button onClick={startVerification} disabled={requesting}>
        {requesting ? 'Preparing...' : 'Verify with World ID'}
      </button>
      {config && rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={config.app_id}
          action={config.action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: 'marketplace-human-worker' })}
          environment={config.environment}
          handleVerify={handleVerify}
          onSuccess={() => setOpen(false)}
          onError={(errorCode) => onError(`IDKit error: ${errorCode}`)}
        />
      )}
    </>
  );
}
