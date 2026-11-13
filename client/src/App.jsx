import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Cpu, FlaskConical, Gauge, Play, Plus, Radio, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, WifiOff, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./api";

const sampleDevices = ["ccms-01", "ccms-02", "ccms-03", "ccms-04", "ccms-05"];
const random = (min, max, decimals = 1) => Number((min + Math.random() * (max - min)).toFixed(decimals));
const makeReading = (deviceId, index = 0, messageId = null) => ({
  messageId: messageId || `${deviceId}-${Date.now()}-${Math.floor(Math.random() * 999)}`,
  deviceId,
  site: "Airoli Demo Campus",
  feeder: index % 2 ? "Feeder-B" : "Feeder-A",
  relayState: "ON",
  timestamp: new Date().toISOString(),
  voltage: random(218, 240),
  current: random(6, 24),
  powerFactor: random(0.88, 0.99, 2),
  thd: random(1.2, 4.5, 2),
  energyKwh: random(1200, 1600, 2)
});

function Metric({ label, value, unit, icon: Icon, tone, note }) {
  return <div className="metric card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17}/></span></div>
    <div className="metric-value">{value}<small>{unit}</small></div><div className="metric-note">{note}</div>
  </div>;
}
function Status({ online }) { return <span className={`status ${online ? "online" : "offline"}`}><i/>{online ? "API connected" : "API offline"}</span>; }

export default function App() {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState([]);
  const [readings, setReadings] = useState([]);
  const [rules, setRules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [diagnostics, setDiagnostics] = useState({ stats: {}, devices: [], events: [] });
  const [verifyReport, setVerifyReport] = useState(null);
  const [sentence, setSentence] = useState("Alert when voltage is below 205 V");
  const [draft, setDraft] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [health, d, r, a, latest, diag] = await Promise.all([
        api.health(), api.devices(), api.rules(), api.alerts(), api.latest(), api.diagnostics()
      ]);
      setConnected(health.status === "ok");
      setDevices(d);
      setRules(r);
      setAlerts(a);
      setReadings(latest);
      setDiagnostics(diag);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, [refresh]);

  const totals = useMemo(() => {
    if (!readings.length) return { voltage: "â€”", current: "â€”", pf: "â€”", thd: "â€”" };
    const avg = key => (readings.reduce((sum, r) => sum + Number(r[key] || 0), 0) / readings.length).toFixed(key === "powerFactor" || key === "thd" ? 2 : 1);
    return { voltage: avg("voltage"), current: avg("current"), pf: avg("powerFactor"), thd: avg("thd") };
  }, [readings]);

  const chartData = useMemo(() => history.slice().reverse().map(r => ({
    time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    voltage: r.voltage, thd: r.thd
  })), [history]);

  async function startSimulator() {
    setBusy(true); setMessage("");
    try {
      for (let i = 0; i < sampleDevices.length; i++) await api.ingest(makeReading(sampleDevices[i], i));
      await refresh(); setMessage("5 simulated CCMS units sent live telemetry packets.");
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function injectDuplicate(deviceId) {
    setBusy(true);
    try {
      const packet = makeReading(deviceId, 0, `dup-test-${Date.now()}`);
      await api.ingest(packet);
      const second = await api.ingest(packet);
      await refresh();
      setMessage(second.duplicate ? `Idempotency verified: Duplicate packet from ${deviceId} rejected!` : "Duplicate check failed.");
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function injectMalformed(deviceId) {
    setBusy(true);
    try {
      await api.ingest({ ...makeReading(deviceId), voltage: -120 });
    } catch (e) {
      await refresh();
      setMessage(`Schema guard caught invalid packet from ${deviceId}: ${e.message}`);
    } finally { setBusy(false); }
  }

  async function handleFaultToggle(deviceId, currentlyOffline) {
    setBusy(true);
    try {
      if (!currentlyOffline) {
        await api.toggleFault(deviceId, true);
        setMessage(`Injected heartbeat drop on ${deviceId}. Device marked OFFLINE.`);
      } else {
        const res = await api.ingest(makeReading(deviceId));
        setMessage(`${deviceId} reconnected! Recovery time measured: ${res.recoveryMs ?? 0} ms.`);
      }
      await refresh();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function handleRelayTest(deviceId, simulateTimeout) {
    setBusy(true);
    try {
      const res = await api.sendRelay(deviceId, "OFF", simulateTimeout);
      await refresh();
      setMessage(res.ok
        ? `Relay ACK received from ${deviceId} in ${res.latencyMs}ms.`
        : `RELAY ACK TIMEOUT on ${deviceId}: Device failed to acknowledge within 3000ms.`
      );
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function executeVerificationSuite() {
    setBusy(true);
    try {
      const report = await api.runVerification();
      setVerifyReport(report);
      await refresh();
      setMessage(`Automated Verification Suite completed: ${report.summary}`);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function loadHistory(deviceId) {
    try { setHistory(await api.history(deviceId)); } catch (e) { setMessage(e.message); }
  }
  async function parseSentence() {
    setBusy(true); setDraft(null); setTestResult(null);
    try { const result = await api.parseRule(sentence); setDraft(result.rule); setMessage(result.explanation); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    try { await api.saveRule(draft); setDraft(null); await refresh(); setMessage("Rule saved. The backend will evaluate it on incoming telemetry."); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function testRule(rule) {
    setBusy(true); setTestResult(null);
    try {
      const synthetic = Array.from({ length: 100 }, (_, i) => {
        const reading = makeReading(`sim-${String(i + 1).padStart(3, "0")}`, i);
        reading[rule.field] = rule.operator.includes("gt") ? Number((rule.threshold + random(-2, 4, 2)).toFixed(2)) : Number((rule.threshold + random(-4, 2, 2)).toFixed(2));
        return reading;
      });
      setTestResult(await api.testRule(rule.id, synthetic));
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = text.trim().split(/\r?\n/);
    const headers = rows.shift().split(",").map(x => x.trim());
    const imported = rows.map(line => {
      const values = line.split(",");
      return Object.fromEntries(headers.map((h, i) => [h, (values[i] || "").trim()]));
    });
    try {
      const result = await api.bulkDevices(imported);
      await refresh(); setMessage(`Imported ${result.imported} devices; rejected ${result.rejected.length}.`);
    } catch (e) { setMessage(e.message); }
    event.target.value = "";
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={21}/></div><div><b>voltwise</b><small>CCMS VERIFIER</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className={`nav-item ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}><Gauge size={18}/>Overview</button>
      <button className={`nav-item ${activeTab === "chaos" ? "active" : ""}`} onClick={() => setActiveTab("chaos")}><FlaskConical size={18}/>Fault &amp; Verify<span>{diagnostics.events.length}</span></button>
      <button className={`nav-item ${activeTab === "devices" ? "active" : ""}`} onClick={() => setActiveTab("devices")}><Cpu size={18}/>Device fleet<span>{devices.length}</span></button>
      <button className={`nav-item ${activeTab === "rules" ? "active" : ""}`} onClick={() => setActiveTab("rules")}><Sparkles size={18}/>Rule studio<span>{rules.length}</span></button>
      <button className={`nav-item ${activeTab === "alerts" ? "active" : ""}`} onClick={() => setActiveTab("alerts")}><AlertTriangle size={18}/>Alert history<span>{alerts.length}</span></button>
      <div className="sidebar-bottom"><div className="safe-card"><ShieldCheck size={18}/><b>Verification bench</b><p>Simulates CCMS telemetry, fault injection, and ACK timeouts.</p></div><div className="user-chip"><div className="avatar">VW</div><div><b>VoltWise Demo</b><small>Local workspace</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="crumb">Workspace</span><span className="slash">/</span><b>{activeTab === "overview" ? "Overview" : activeTab === "chaos" ? "Fault injection & verification" : activeTab === "devices" ? "Device fleet" : activeTab === "rules" ? "Rule studio" : "Alert history"}</b></div><div className="top-actions"><Status online={connected}/><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div></header>
      <div className="content">
        <section className="page-heading">
          <div>
            <div className="eyebrow">CCMS TELEMETRY Â· CHAOS &amp; RULE ENGINE</div>
            <h1>{activeTab === "overview" ? "Operations overview" : activeTab === "chaos" ? "CCMS Fault Injection & Test Runner" : activeTab === "devices" ? "Device fleet" : activeTab === "rules" ? "Rule studio" : "Alert history"}</h1>
            <p>Simulate CCMS telemetry, inject communication faults, and verify recovery.</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="secondary" disabled={busy || !connected} onClick={executeVerificationSuite}><FlaskConical size={16}/>Run Verification Suite</button>
            <button className="primary" disabled={busy || !connected} onClick={startSimulator}><Play size={16}/>{busy ? "Working..." : "Simulate 5 CCMS"}</button>
          </div>
        </section>
        {message && <div className="notice" onClick={() => setMessage("")}>{message}<button>Ã—</button></div>}

        {activeTab === "overview" && <>
          <div className="metric-grid">
            <Metric label="Active devices" value={devices.length} unit="" icon={Cpu} tone="blue" note="Registered CCMS units"/>
            <Metric label="Average voltage" value={totals.voltage} unit="V" icon={Zap} tone="amber" note="Across latest readings"/>
            <Metric label="Duplicates blocked" value={diagnostics.stats.duplicatesRejected || 0} unit="" icon={ShieldCheck} tone="green" note="Idempotency guard"/>
            <Metric label="Faults / Timeouts" value={(diagnostics.stats.malformedRejected || 0) + (diagnostics.stats.relayTimeouts || 0)} unit="" icon={ShieldAlert} tone="purple" note="Schema & ACK failures"/>
          </div>
          <div className="dashboard-grid">
            <section className="card panel"><div className="panel-heading"><div><h2>Live device telemetry</h2><p>Most recent reading received per CCMS unit</p></div><span className="live-pill"><i/>LIVE SNAPSHOT</span></div>
              {readings.length ? <div className="table-wrap"><table><thead><tr><th>DEVICE</th><th>SITE / FEEDER</th><th>VOLTAGE</th><th>CURRENT</th><th>PF</th><th>THD</th><th>STATUS</th></tr></thead><tbody>{readings.map(r => {
                const h = diagnostics.devices.find(x => x.deviceId === r.deviceId);
                const offline = h?.status === "OFFLINE";
                return <tr key={r.deviceId} onClick={() => loadHistory(r.deviceId)}><td><span className="device-dot" style={{ background: offline ? "#f0808b" : "#49c89a" }}/><b>{r.deviceId}</b></td><td>{r.site}<small>{r.feeder}</small></td><td>{Number(r.voltage).toFixed(1)} V</td><td>{Number(r.current).toFixed(1)} A</td><td>{Number(r.powerFactor).toFixed(2)}</td><td><span className={r.thd > 5 ? "value-warn" : ""}>{Number(r.thd).toFixed(2)}%</span></td><td><span className={`status ${offline ? "offline" : "online"}`}><i/>{offline ? "OFFLINE" : "ONLINE"}</span></td></tr>;
              })}</tbody></table></div> : <Empty title="No telemetry received" body="Click Simulate 5 CCMS to generate live telemetry packets."/>}
            </section>
            <section className="card panel rule-promo"><div className="panel-heading"><div><h2>Chaos &amp; Verification</h2><p>Test heartbeats, duplicates &amp; relay ACKs.</p></div><div className="spark-icon"><FlaskConical size={18}/></div></div>
              <div className="rule-example"><span>PRE-DEPLOYMENT CHECK</span><p>Inject link drops, duplicate packets &amp; relay timeouts before field rollout.</p></div>
              <button className="secondary full" onClick={() => setActiveTab("chaos")}>Open Fault Bench <ArrowUpRight size={16}/></button>
              <div className="mini-stats"><div><b>{rules.length}</b><small>Saved rules</small></div><div><b>{diagnostics.events.length}</b><small>Diag events</small></div></div>
            </section>
          </div>
          {history.length > 0 && <section className="card panel chart-panel"><div className="panel-heading"><div><h2>Telemetry history</h2><p>Recent readings for selected device</p></div><button className="text-button" onClick={() => setHistory([])}>Close</button></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="voltageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b8def" stopOpacity={0.25}/><stop offset="100%" stopColor="#5b8def" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#253147"/><XAxis dataKey="time" stroke="#77849a"/><YAxis stroke="#77849a"/><Tooltip contentStyle={{background:"#111b2d",border:"1px solid #29364c",borderRadius:10}}/><Area type="monotone" dataKey="voltage" stroke="#6f9cff" fill="url(#voltageFill)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>}
          <section className="card panel"><div className="panel-heading"><div><h2>Recent alerts</h2><p>Rule matches generated by the deterministic engine</p></div><button className="text-button" onClick={() => setActiveTab("alerts")}>View all</button></div><AlertList alerts={alerts.slice(0, 5)}/></section>
        </>}

        {activeTab === "chaos" && <>
          {verifyReport && <section className="card panel">
            <div className="panel-heading">
              <div><h2>Automated Verification Report ({verifyReport.summary})</h2><p>Executed at {new Date(verifyReport.executedAt).toLocaleTimeString()}</p></div>
              <span className={`status ${verifyReport.allPassed ? "online" : "offline"}`}><i/>{verifyReport.allPassed ? "ALL CHECKS PASSED" : "ISSUES FOUND"}</span>
            </div>
            <div className="rule-list">
              {verifyReport.results.map(item => (
                <div className="rule-row" key={item.id}>
                  <div className="rule-symbol" style={{ color: item.passed ? "#5ed6a5" : "#f0808b" }}>
                    {item.passed ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}
                  </div>
                  <div className="rule-info">
                    <b>{item.id}: {item.name}</b>
                    <small>{item.detail}</small>
                  </div>
                  <span className={`severity ${item.passed ? "" : "critical"}`}>{item.passed ? "PASS" : "FAIL"}</span>
                </div>
              ))}
            </div>
          </section>}

          <section className="card panel">
            <div className="panel-heading">
              <div><h2>Per-Device Fault Injection Bench</h2><p>Simulate network drops, duplicate replays, invalid payloads &amp; relay ACK failures</p></div>
              <span className="count">{diagnostics.devices.length} ACTIVE UNITS</span>
            </div>
            {diagnostics.devices.length ? <div className="table-wrap"><table>
              <thead><tr><th>CCMS UNIT</th><th>LINK STATUS</th><th>LAST RECOVERY</th><th>FAULT INJECTION ACTIONS</th></tr></thead>
              <tbody>{diagnostics.devices.map(d => {
                const offline = d.status === "OFFLINE";
                return <tr key={d.deviceId}>
                  <td><b>{d.deviceId}</b></td>
                  <td><span className={`status ${offline ? "offline" : "online"}`}><i/>{d.status}</span></td>
                  <td>{d.lastRecoveryMs !== null ? `${d.lastRecoveryMs} ms` : "â€”"}</td>
                  <td style={{ display: "flex", gap: "8px" }}>
                    <button className="secondary small" disabled={busy} onClick={() => handleFaultToggle(d.deviceId, offline)}>
                      <WifiOff size={13}/> {offline ? "Reconnect & Recover" : "Drop Heartbeat"}
                    </button>
                    <button className="secondary small" disabled={busy} onClick={() => injectDuplicate(d.deviceId)}>Replay Duplicate</button>
                    <button className="secondary small" disabled={busy} onClick={() => injectMalformed(d.deviceId)}>Invalid Packet</button>
                    <button className="secondary small" disabled={busy} onClick={() => handleRelayTest(d.deviceId, false)}>Relay ACK OK</button>
                    <button className="secondary small" disabled={busy} onClick={() => handleRelayTest(d.deviceId, true)}>Relay Timeout</button>
                  </td>
                </tr>;
              })}</tbody>
            </table></div> : <Empty title="No simulated units active" body="Click 'Simulate 5 CCMS' in the top right first to initialize devices." />}
          </section>

          <section className="card panel">
            <div className="panel-heading"><div><h2>Diagnostics &amp; Protocol Event Log</h2><p>Real-time audit trail of heartbeats, deduplication, and relay ACKs</p></div><span className="count">{diagnostics.events.length} EVENTS</span></div>
            {diagnostics.events.length ? <div className="alert-list">
              {diagnostics.events.map(ev => (
                <div className="alert-row" key={ev.id}>
                  <div className={`alert-icon ${ev.severity}`}><Activity size={16}/></div>
                  <div className="alert-copy"><b>{ev.type} Â· {ev.deviceId}</b><p>{ev.detail}</p><small>{new Date(ev.timestamp).toLocaleTimeString()}</small></div>
                  <span className={`severity ${ev.severity}`}>{ev.severity}</span>
                </div>
              ))}
            </div> : <Empty title="No diagnostic events yet" body="Trigger a fault above or click Run Verification Suite." />}
          </section>
        </>}

        {activeTab === "devices" && <section className="card panel"><div className="panel-heading"><div><h2>Registered meters</h2><p>Device identity and latest telemetry</p></div><label className="secondary upload-btn"><Plus size={16}/>Import CSV<input type="file" accept=".csv" onChange={importCsv}/></label></div><p className="csv-hint">CSV headers: <code>deviceId,name,site,feeder</code></p><div className="table-wrap"><table><thead><tr><th>DEVICE ID</th><th>NAME</th><th>SITE</th><th>FEEDER</th><th>LAST VOLTAGE</th><th>STATUS</th></tr></thead><tbody>{devices.map(d => {const r = readings.find(x => x.deviceId === d.deviceId); return <tr key={d.deviceId}><td><b>{d.deviceId}</b></td><td>{d.name}</td><td>{d.site}</td><td>{d.feeder}</td><td>{r ? `${Number(r.voltage).toFixed(1)} V` : "No data"}</td><td><span className={`status ${r ? "online" : "offline"}`}><i/>{r ? "Seen" : "Awaiting data"}</span></td></tr>})}</tbody></table>{!devices.length && <Empty title="Fleet is empty" body="Start the simulator or import a device CSV."/>}</div></section>}

        {activeTab === "rules" && <>
          <section className="card panel"><div className="panel-heading"><div><h2>Natural-language rule authoring</h2><p>Constrained phrase parser â†’ validated JSON rule â†’ deterministic execution</p></div><div className="spark-icon"><Sparkles size={18}/></div></div>
            <label className="field-label">DESCRIBE THE CONDITION</label><div className="composer"><input value={sentence} onChange={e => setSentence(e.target.value)} onKeyDown={e => e.key === "Enter" && parseSentence()} placeholder="Alert when THD is above 5 percent"/><button className="primary" disabled={busy || !connected} onClick={parseSentence}><Sparkles size={16}/>Parse rule</button></div>
            <div className="supported">Supported fields: voltage Â· current Â· power factor Â· THD Â· energy. Example: <button onClick={() => setSentence("Alert when THD is above 5 percent")}>THD above 5%</button></div>
            {draft && <div className="draft-card"><div className="draft-top"><div><span className="eyebrow">PROPOSED RULE Â· REVIEW BEFORE SAVING</span><h3>{draft.name}</h3></div><span className="status online"><i/>Validated</span></div><div className="dsl"><pre>{JSON.stringify(draft, null, 2)}</pre></div><p className="safety-note"><ShieldCheck size={15}/>The parser only creates a restricted rule object. It does not execute generated code or control physical equipment.</p><button className="primary" onClick={saveDraft} disabled={busy}>Confirm and save rule</button></div>}
          </section>
          <section className="card panel"><div className="panel-heading"><div><h2>Saved rules</h2><p>Backend evaluates enabled rules on each incoming reading.</p></div><span className="count">{rules.length} RULES</span></div>
            {rules.length ? <div className="rule-list">{rules.map(rule => <div className="rule-row" key={rule.id}><div className="rule-symbol"><Zap size={17}/></div><div className="rule-info"><b>{rule.name}</b><small>{rule.field} {rule.operator} {rule.threshold} {rule.unit} Â· {rule.severity} Â· cooldown {rule.cooldownSeconds}s</small></div><button className="secondary small" disabled={busy} onClick={() => testRule(rule)}>Test rule <ArrowUpRight size={14}/></button></div>)}</div> : <Empty title="No rules configured" body="Parse and save a rule above to start evaluating incoming telemetry."/>}
            {testResult && <div className="test-result"><div><b>Simulation results</b><span>{testResult.matched} matches / {testResult.tested} readings</span></div><div className="result-bar"><i style={{width:`${testResult.tested ? testResult.matched / testResult.tested * 100 : 0}%`}}/></div><small>Test uses generated sample readings and does not create device-side actions.</small></div>}
          </section>
        </>}

        {activeTab === "alerts" && <section className="card panel"><div className="panel-heading"><div><h2>Alert history</h2><p>Rule trigger events with source device and measured value</p></div><span className="count">{alerts.length} EVENTS</span></div><AlertList alerts={alerts}/></section>}
        <footer><span>VOLTWISE Â· CCMS VERIFICATION &amp; RULE WORKBENCH</span><span>Simulated telemetry Â· Fault injection enabled</span></footer>
      </div>
    </main>
  </div>;
}

function AlertList({ alerts }) {
  if (!alerts.length) return <Empty title="No alerts yet" body="Save a rule and send telemetry that matches its condition." />;
  return <div className="alert-list">{alerts.map(alert => <div className="alert-row" key={alert.id}><div className={`alert-icon ${alert.severity}`}><AlertTriangle size={16}/></div><div className="alert-copy"><b>{alert.ruleName}</b><p>{alert.message}</p><small>{alert.deviceId} Â· {new Date(alert.createdAt).toLocaleString()}</small></div><span className={`severity ${alert.severity}`}>{alert.severity}</span></div>)}</div>;
}
function Empty({ title, body }) { return <div className="empty"><div className="empty-icon"><Radio size={21}/></div><b>{title}</b><p>{body}</p></div>; }
