import React, { useEffect, useState } from 'react';
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit';
import { apiFetch } from './api';

export function WorldIDButton({ onVerify, onError, disabled = false }) {
  const [config, setConfig] = useState(null);
  const [rpContext, setRpContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [open, setOpen] = useState(false);
  const [hostError, setHostError] = useState('');

  useEffect(() => {
    apiFetch('/api/world/config')
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
    setHostError('');
    onError('');
    try {
      const response = await apiFetch('/api/world/rp-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const formatVerificationError = data => {
    if (!data) return 'World ID verification failed';
    if (typeof data.detail === 'string' && data.detail.trim()) {
      try {
        const parsed = JSON.parse(data.detail);
        return parsed.detail || parsed.message || parsed.error || data.error || 'World ID verification failed';
      } catch {
        return data.detail;
      }
    }
    if (data.detail && typeof data.detail === 'object') {
      return data.detail.detail || data.detail.message || data.detail.error || data.error || 'World ID verification failed';
    }
    return data.error || 'World ID verification failed';
  };

  const handleVerify = async (idkitResponse) => {
    const response = await apiFetch('/api/world/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idkitResponse }),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = formatVerificationError(data);
      setHostError(message);
      onError(message);
      throw new Error(message);
    }
    setHostError('');
    onVerify(data);
  };

  if (loading) {
    return <button className="primary-button" disabled>Loading World ID...</button>;
  }

  return (
    <>
      <button className="primary-button" onClick={startVerification} disabled={disabled || requesting}>
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
          onError={(errorCode) => {
            if (errorCode === 'failed_by_host_app' && hostError) {
              onError(hostError);
              return;
            }
            onError(`IDKit error: ${errorCode}`);
          }}
        />
      )}
    </>
  );
}
