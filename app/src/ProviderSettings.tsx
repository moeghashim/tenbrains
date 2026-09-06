import { useEffect, useState } from 'react';
import { Button } from './components/ui/button';

type Surface = 'intake' | 'sessions';
type Routing = Record<Surface, { provider: string; model: string }>;
type SettingsData = {
  routing: Routing;
  providers: { id: string; status: 'available' | 'needs-login' | 'unsupported'; reason: string; expiresAt?: string | null; loginCommand?: string }[];
};

export function ProviderSettings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<Routing | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');
    setNotice('');
    fetch('/api/providers')
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((result: SettingsData) => {
        if (cancelled) return;
        setData(result);
        setDraft(result.routing);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [attempt]);

  async function save(surface: Surface) {
    if (!draft) return;
    const choice = draft[surface];
    setSaving(surface);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/providers', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [surface]: { provider: choice.provider, ...(choice.model.trim() ? { model: choice.model.trim() } : {}) } }),
      });
      if (!response.ok) throw new Error(response.status === 400 ? 'Settings could not save. Check the provider and model, then try again.' : 'Settings could not save. Try again.');
      const result: SettingsData = await response.json();
      setData(result);
      setDraft(result.routing);
      const effective = result.routing[surface];
      const overridden = effective.provider !== choice.provider || (choice.model.trim() && effective.model !== choice.model.trim());
      setNotice(overridden
        ? 'Your choice was saved. Environment settings override it. The current routing below still applies.'
        : 'Settings saved. The current routing below applies to your next turn.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings could not save. Try again.');
    } finally {
      setSaving('');
    }
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopyNotice('Command copied. Run it in your terminal, then refresh status.');
    } catch {
      setCopyNotice('Copy failed. Select the command and copy it manually.');
    }
  }

  const busy = status !== 'ready' || Boolean(saving);
  return <main className="main-surface workspace-main settings-main">
    <header className="topbar">
      <div className="breadcrumb"><strong>Settings</strong></div>
      <Button variant="outline" disabled={status === 'loading' || Boolean(saving)} onClick={() => setAttempt((value) => value + 1)}>Refresh status</Button>
    </header>
    <div className="provider-settings">
      <h1>Choose how Wayfinder runs</h1>
      <p>Set a provider and model for each part of your discovery.</p>
      {status === 'loading' && <p role="status">Loading provider settings…</p>}
      {status === 'error' && <div role="alert" className="settings-error"><p>Provider settings could not load. Refresh before making changes.</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div>}
      {error && <p role="alert" className="settings-error">{error}</p>}
      <p role="status" className="settings-notice">{notice}</p>
      {data && draft && <>
        <section aria-labelledby="routing-heading">
          <h2 id="routing-heading">Routing</h2>
          <p>Current routing comes from the API. Environment settings take priority over your saved choices.</p>
          <p>Clear the model field to use the provider default.</p>
          {(['intake', 'sessions'] as const).map((surface) => (
            <form className="settings-routing-row" aria-label={surface === 'intake' ? 'Intake routing' : 'Grilling sessions routing'} key={surface} onSubmit={(event) => { event.preventDefault(); void save(surface); }}>
              <h3>{surface === 'intake' ? 'Intake' : 'Grilling sessions'}</h3>
              <p className="settings-current">Current: <strong>{data.routing[surface].provider}</strong> / <strong>{data.routing[surface].model}</strong></p>
              <fieldset disabled={busy}>
                <label htmlFor={`${surface}-provider`}>Provider<select id={`${surface}-provider`} value={draft[surface].provider} onChange={(event) => setDraft({ ...draft, [surface]: { provider: event.target.value, model: '' } })}>{data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.id}</option>)}</select></label>
                <label htmlFor={`${surface}-model`}>Model<input id={`${surface}-model`} value={draft[surface].model} placeholder="Provider default" onChange={(event) => setDraft({ ...draft, [surface]: { ...draft[surface], model: event.target.value } })} /></label>
                <Button type="submit">{saving === surface ? 'Saving…' : 'Save routing'}</Button>
              </fieldset>
            </form>
          ))}
        </section>
        <section aria-labelledby="auth-heading">
          <h2 id="auth-heading">Provider access</h2>
          <p>Available means local access is configured. Remote acceptance is not verified.</p>
          <p role="status">{copyNotice}</p>
          <ul className="settings-provider-list">{data.providers.map((provider) => (
            <li key={provider.id}>
              <div className="settings-provider-heading"><h3>{provider.id}</h3><span className={`settings-provider-state ${provider.status}`}>{provider.status === 'needs-login' ? 'Needs login' : provider.status === 'available' ? 'Available' : 'Unsupported'}</span></div>
              <p>{provider.reason}</p>
              {provider.expiresAt && <p className="settings-expiry">Expires: <time dateTime={provider.expiresAt}>{new Date(provider.expiresAt).toLocaleString()}</time></p>}
              {provider.status === 'needs-login' && provider.loginCommand && <>
                <p>Run this command in your terminal, then refresh status.</p>
                <div className="settings-login"><code>{provider.loginCommand}</code><Button variant="outline" aria-label={`Copy ${provider.id} login command`} onClick={() => void copyCommand(provider.loginCommand!)}>Copy command</Button></div>
              </>}
            </li>
          ))}</ul>
        </section>
      </>}
    </div>
  </main>;
}
