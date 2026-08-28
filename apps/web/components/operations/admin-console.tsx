"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";

const capabilities = ["TRANSFER_REVIEW", "QUOTE_MANAGE", "FUNDING_REVIEW", "PAYOUT_MANAGE", "TRANSFER_HOLD", "DISPUTE_MANAGE", "REFUND_MANAGE", "ASSOCIATE_VIEW", "ASSOCIATE_MANAGE", "STAFF_MANAGE", "CONFIG_MANAGE", "AUDIT_VIEW"] as const;
const payoutMethods = ["BANK_TRANSFER", "CASH_PICKUP", "MOBILE_MONEY", "OTHER"] as const;
const defaultContentTypes = ["image/jpeg", "image/png", "application/pdf"];

type StaffRecord = { id: string; fullName: string; email: string; status: string; operationalStatus: string; capabilities: string[]; createdAt: string };
type ConfigurationRecord = { version: number; active: boolean; quoteSlaMinutes: number; quoteDefaultExpiryMinutes: number; supportedOriginCountries: string[]; supportedDestinationCountries: string[]; supportedCurrencies: string[]; payoutMethodsByDestination: Record<string, string[]>; evidenceMaxSizeBytes: string; evidenceAllowedContentTypes: string[]; transferLimitsByCurrency?: Record<string, { minimumAmountMinor?: string; maximumAmountMinor?: string }> | null; broadcastMessage?: string | null; maintenanceMessage?: string | null };
type TemplateRecord = { id: string; name: string; method: string; currency: string; payeeName: string; provider: string | null; accountReference: string | null; instructions: string; active: boolean; updatedAt: string };
type AssociateRecord = { id: string; businessName: string; countries: string[]; cities: string[]; payoutMethods: string[]; currencies: string[]; contactChannels: Record<string, string>; status: string; updatedAt: string };
type ActivityRecord = { id: string; actionType: string; outcome: string; entityType: string | null; entityId: string | null; actor?: { fullName?: string } | null; actorUser?: { fullName?: string } | null; actorRole: string | null; reason: string | null; createdAt: string };
type DashboardRecord = { counts: { overdueQuotes: number; fundingAttention: number; overduePayouts: number; activeDisputes: number; pendingRefunds: number }; workItems: { id: string; reference: string; status: string; category: string; dueAt?: string | null }[] };

function words(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function codes(value: string) { return value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean); }
function statusTone(status: string): "success" | "warning" | "neutral" { return status === "ACTIVE" || status === "SUCCESS" ? "success" : status === "INACTIVE" ? "neutral" : "warning"; }

function requiredReason(action: string) {
  const reason = window.prompt(`${action}\n\nAdd the required audit reason:`)?.trim();
  if (!reason) return null;
  return window.confirm(`${action}? This action will be recorded.`) ? reason : null;
}

export function AdminConsole() {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [configuration, setConfiguration] = useState<ConfigurationRecord | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [associates, setAssociates] = useState<AssociateRecord[]>([]);
  const [events, setEvents] = useState<ActivityRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [staffDraft, setStaffDraft] = useState({ fullName: "", email: "", temporaryPassword: "", capability: "TRANSFER_REVIEW", reason: "" });
  const [templateDraft, setTemplateDraft] = useState({ name: "", method: "BANK_TRANSFER", currency: "AED", payeeName: "", provider: "", accountReference: "", instructions: "", reason: "" });
  const [associateDraft, setAssociateDraft] = useState({ businessName: "", country: "PH", city: "", currency: "PHP", payoutMethod: "BANK_TRANSFER", email: "" });
  const [configDraft, setConfigDraft] = useState({ origins: "AE", destinations: "PH", currencies: "AED, PHP", quoteSlaMinutes: "45", quoteDefaultExpiryMinutes: "30", evidenceMaxSizeBytes: "8388608", contentTypes: defaultContentTypes.join(", "), payoutMethods: payoutMethods.slice(0, 3) as readonly string[], broadcastMessage: "", maintenanceMessage: "", senderTransferLimitMinor: "", reason: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const [staffResult, configResult, templateResult, associateResult, activityResult, dashboardResult] = await Promise.all([
        apiFetch<{ staff: StaffRecord[] }>("/admin/staff"),
        apiFetch<{ configuration: ConfigurationRecord | null }>("/admin/configuration"),
        apiFetch<{ templates: TemplateRecord[] }>("/admin/funding-templates"),
        apiFetch<{ associates: AssociateRecord[] }>("/operations/associates"),
        apiFetch<{ events: ActivityRecord[] }>("/admin/activity"),
        apiFetch<DashboardRecord>("/admin/dashboard")
      ]);
      setStaff(staffResult.staff); setConfiguration(configResult.configuration); setTemplates(templateResult.templates); setAssociates(associateResult.associates); setEvents(activityResult.events); setDashboard(dashboardResult);
      const current = configResult.configuration;
      if (current) setConfigDraft({
        origins: current.supportedOriginCountries.join(", "), destinations: current.supportedDestinationCountries.join(", "), currencies: current.supportedCurrencies.join(", "),
        quoteSlaMinutes: String(current.quoteSlaMinutes), quoteDefaultExpiryMinutes: String(current.quoteDefaultExpiryMinutes), evidenceMaxSizeBytes: current.evidenceMaxSizeBytes,
        contentTypes: current.evidenceAllowedContentTypes.join(", "), payoutMethods: [...new Set(Object.values(current.payoutMethodsByDestination).flat())], broadcastMessage: current.broadcastMessage || "", maintenanceMessage: current.maintenanceMessage || "", senderTransferLimitMinor: Object.values(current.transferLimitsByCurrency || {})[0]?.maximumAmountMinor || "", reason: ""
      });
    } catch (caught) { setError(errorMessage(caught)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate<T>(path: string, init: RequestInit) {
    setActing(true); setError("");
    try { const result = await apiFetch<T>(path, init); await load(); return result; }
    catch (caught) { setError(errorMessage(caught)); return null; }
    finally { setActing(false); }
  }

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Create this staff account and grant its initial capability?")) return;
    const result = await mutate("/admin/staff", { method: "POST", body: JSON.stringify({ ...staffDraft, capabilities: [staffDraft.capability], confirmed: true }) });
    if (result) setStaffDraft({ fullName: "", email: "", temporaryPassword: "", capability: "TRANSFER_REVIEW", reason: "" });
  }

  async function changeStaffStatus(item: StaffRecord) {
    const next = item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const reason = requiredReason(`${next === "ACTIVE" ? "Activate" : "Suspend"} ${item.fullName}`); if (!reason) return;
    await mutate(`/admin/staff/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: next, operationalStatus: next === "ACTIVE" ? "ACTIVE" : "INACTIVE", reason, confirmed: true }) });
  }

  async function grantCapability(item: StaffRecord, capability: string) {
    const reason = requiredReason(`Grant ${words(capability)} to ${item.fullName}`); if (!reason) return;
    await mutate(`/admin/staff/${item.id}/capabilities`, { method: "POST", body: JSON.stringify({ capability, reason, confirmed: true }) });
  }

  async function revokeCapability(item: StaffRecord, capability: string) {
    const reason = requiredReason(`Revoke ${words(capability)} from ${item.fullName}`); if (!reason) return;
    await mutate(`/admin/staff/${item.id}/capabilities/${capability}`, { method: "DELETE", body: JSON.stringify({ reason, confirmed: true }) });
  }

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault(); if (!window.confirm("Activate this new configuration version?")) return;
    const destinations = codes(configDraft.destinations);
    const payoutMethodsByDestination = Object.fromEntries(destinations.map((country) => [country, configDraft.payoutMethods]));
    await mutate("/admin/configuration", { method: "POST", body: JSON.stringify({
      quoteSlaMinutes: Number(configDraft.quoteSlaMinutes), quoteDefaultExpiryMinutes: Number(configDraft.quoteDefaultExpiryMinutes),
      supportedOriginCountries: codes(configDraft.origins), supportedDestinationCountries: destinations, supportedCurrencies: codes(configDraft.currencies), payoutMethodsByDestination,
      evidenceMaxSizeBytes: Number(configDraft.evidenceMaxSizeBytes), evidenceAllowedContentTypes: configDraft.contentTypes.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
      transferLimitsByCurrency: configDraft.senderTransferLimitMinor.trim() ? { [codes(configDraft.currencies)[0]!]: { maximumAmountMinor: configDraft.senderTransferLimitMinor.trim() } } : undefined,
      broadcastMessage: configDraft.broadcastMessage.trim() || null, maintenanceMessage: configDraft.maintenanceMessage.trim() || null,
      reason: configDraft.reason.trim(), confirmed: true
    }) });
  }

  async function createTemplate(event: FormEvent) {
    event.preventDefault(); if (!window.confirm("Create and activate this funding template?")) return;
    const result = await mutate("/admin/funding-templates", { method: "POST", body: JSON.stringify({ ...templateDraft, currency: templateDraft.currency.trim().toUpperCase(), provider: templateDraft.provider.trim() || undefined, accountReference: templateDraft.accountReference.trim() || undefined, confirmed: true }) });
    if (result) setTemplateDraft({ name: "", method: "BANK_TRANSFER", currency: "AED", payeeName: "", provider: "", accountReference: "", instructions: "", reason: "" });
  }

  async function toggleTemplate(item: TemplateRecord) {
    const reason = requiredReason(`${item.active ? "Deactivate" : "Activate"} ${item.name}`); if (!reason) return;
    await mutate(`/admin/funding-templates/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active, reason, confirmed: true }) });
  }

  async function createAssociate(event: FormEvent) {
    event.preventDefault();
    const result = await mutate("/operations/associates", { method: "POST", body: JSON.stringify({ businessName: associateDraft.businessName, countries: codes(associateDraft.country), cities: associateDraft.city.trim() ? [associateDraft.city.trim()] : [], payoutMethods: [associateDraft.payoutMethod], currencies: codes(associateDraft.currency), contactChannels: { operationsEmail: associateDraft.email } }) });
    if (result) setAssociateDraft({ businessName: "", country: "PH", city: "", currency: "PHP", payoutMethod: "BANK_TRANSFER", email: "" });
  }

  async function toggleAssociate(item: AssociateRecord) {
    const status = item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const reason = requiredReason(`${words(status)} ${item.businessName}`); if (!reason) return;
    await mutate(`/operations/associates/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, reason, confirmed: true }) });
  }

  const riskCards = dashboard ? [
    ["Quote overdue", dashboard.counts.overdueQuotes], ["Funding attention", dashboard.counts.fundingAttention], ["Payout overdue", dashboard.counts.overduePayouts], ["Active disputes", dashboard.counts.activeDisputes], ["Refund pending", dashboard.counts.pendingRefunds]
  ] as const : [];

  if (loading) return <section className="admin-console"><p className="page-state">Loading administration…</p></section>;

  return <div className="admin-console">
    {error ? <p className="page-error" role="alert">{error}</p> : null}
    <section className="admin-section" id="risk" aria-labelledby="risk-title"><div className="admin-section-heading"><div><p className="eyebrow">Operational risk</p><h2 id="risk-title">SLA and exception watch</h2></div><Button disabled={acting} onClick={() => void load()} size="small" variant="outline">Refresh</Button></div>
      <div className="admin-metrics">{riskCards.map(([label, value]) => <div className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {dashboard?.workItems.length ? <div className="operations-table-wrap"><table className="operations-table admin-table"><thead><tr><th>Reference</th><th>Category</th><th>Status</th><th>Due</th></tr></thead><tbody>{dashboard.workItems.map((item) => <tr key={`${item.category}-${item.id}`}><td>{item.reference}</td><td>{item.category}</td><td>{words(item.status)}</td><td className="due-soon">{item.dueAt ? new Date(item.dueAt).toLocaleString() : "Now"}</td></tr>)}</tbody></table></div> : <p className="admin-empty">No overdue or exception work.</p>}
    </section>

    <section className="admin-section" id="users" aria-labelledby="staff-title"><div className="admin-section-heading"><div><p className="eyebrow">Access administration</p><h2 id="staff-title">Staff and capabilities</h2></div><span>{staff.length} staff</span></div>
      <div className="operations-table-wrap"><table className="operations-table admin-table"><thead><tr><th>Staff</th><th>Status</th><th>Capabilities</th><th>Grant</th><th>Action</th></tr></thead><tbody>{staff.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong><small>{item.email}</small></td><td><StatusBadge label={words(item.status)} tone={statusTone(item.status)} /></td><td><div className="capability-list">{item.capabilities.map((capability) => <button aria-label={`Revoke ${words(capability)} from ${item.fullName}`} disabled={acting} key={capability} onClick={() => void revokeCapability(item, capability)} type="button">{words(capability)} ×</button>)}</div></td><td><select aria-label={`Capability for ${item.fullName}`} defaultValue="" disabled={acting} onChange={(event) => { if (event.target.value) void grantCapability(item, event.target.value); event.target.value = ""; }}><option value="">Add…</option>{capabilities.filter((capability) => !item.capabilities.includes(capability)).map((capability) => <option key={capability} value={capability}>{words(capability)}</option>)}</select></td><td><Button disabled={acting} onClick={() => void changeStaffStatus(item)} size="small" variant={item.status === "ACTIVE" ? "danger" : "outline"}>{item.status === "ACTIVE" ? "Suspend" : "Activate"}</Button></td></tr>)}</tbody></table></div>
      <form className="admin-form admin-form-staff" onSubmit={createStaff}><h3>Create staff account</h3><label>Full name<input required value={staffDraft.fullName} onChange={(event) => setStaffDraft({ ...staffDraft, fullName: event.target.value })} /></label><label>Email<input required type="email" value={staffDraft.email} onChange={(event) => setStaffDraft({ ...staffDraft, email: event.target.value })} /></label><label>Temporary password<input minLength={12} required type="password" value={staffDraft.temporaryPassword} onChange={(event) => setStaffDraft({ ...staffDraft, temporaryPassword: event.target.value })} /></label><label>Initial capability<select value={staffDraft.capability} onChange={(event) => setStaffDraft({ ...staffDraft, capability: event.target.value })}>{capabilities.map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label><label className="admin-span">Audit reason<textarea required rows={2} value={staffDraft.reason} onChange={(event) => setStaffDraft({ ...staffDraft, reason: event.target.value })} /></label><Button disabled={acting} type="submit">Create staff</Button></form>
    </section>

    <section className="admin-section" id="configuration" aria-labelledby="configuration-title"><div className="admin-section-heading"><div><p className="eyebrow">Version {configuration?.version ?? 0}</p><h2 id="configuration-title">Active configuration</h2></div><StatusBadge label={configuration?.active ? "Active" : "Environment defaults"} tone={configuration?.active ? "success" : "neutral"} /></div>
      <form className="admin-form" onSubmit={saveConfiguration}><label>Origin countries<input required value={configDraft.origins} onChange={(event) => setConfigDraft({ ...configDraft, origins: event.target.value })} /></label><label>Destination countries<input required value={configDraft.destinations} onChange={(event) => setConfigDraft({ ...configDraft, destinations: event.target.value })} /></label><label>Supported currencies<input required value={configDraft.currencies} onChange={(event) => setConfigDraft({ ...configDraft, currencies: event.target.value })} /></label><label>Quote SLA minutes<input min="1" required type="number" value={configDraft.quoteSlaMinutes} onChange={(event) => setConfigDraft({ ...configDraft, quoteSlaMinutes: event.target.value })} /></label><label>Quote expiry minutes<input min="5" required type="number" value={configDraft.quoteDefaultExpiryMinutes} onChange={(event) => setConfigDraft({ ...configDraft, quoteDefaultExpiryMinutes: event.target.value })} /></label><label>Evidence limit bytes<input min="1024" required type="number" value={configDraft.evidenceMaxSizeBytes} onChange={(event) => setConfigDraft({ ...configDraft, evidenceMaxSizeBytes: event.target.value })} /></label><fieldset className="admin-span"><legend>Payout methods</legend><div className="checkbox-grid">{payoutMethods.map((method) => <label key={method}><input checked={configDraft.payoutMethods.includes(method)} onChange={(event) => setConfigDraft({ ...configDraft, payoutMethods: event.target.checked ? [...configDraft.payoutMethods, method] : configDraft.payoutMethods.filter((item) => item !== method) })} type="checkbox" />{words(method)}</label>)}</div></fieldset><label className="admin-span">Evidence content types<input required value={configDraft.contentTypes} onChange={(event) => setConfigDraft({ ...configDraft, contentTypes: event.target.value })} /></label><label>Sender limit (minor, optional)<input min="1" type="number" value={configDraft.senderTransferLimitMinor} onChange={(event) => setConfigDraft({ ...configDraft, senderTransferLimitMinor: event.target.value })} /></label><label>Broadcast message<input value={configDraft.broadcastMessage} onChange={(event) => setConfigDraft({ ...configDraft, broadcastMessage: event.target.value })} /></label><label className="admin-span">Maintenance message<textarea rows={2} value={configDraft.maintenanceMessage} onChange={(event) => setConfigDraft({ ...configDraft, maintenanceMessage: event.target.value })} /></label><label className="admin-span">Required change reason<textarea required rows={2} value={configDraft.reason} onChange={(event) => setConfigDraft({ ...configDraft, reason: event.target.value })} /></label><Button disabled={acting || !configDraft.reason.trim()} type="submit">Activate new version</Button></form>
    </section>

    <section className="admin-section" id="templates" aria-labelledby="templates-title"><div className="admin-section-heading"><div><p className="eyebrow">Funding operations</p><h2 id="templates-title">Instruction templates</h2></div><span>{templates.filter((item) => item.active).length} active</span></div>
      <div className="operations-table-wrap"><table className="operations-table admin-table"><thead><tr><th>Name</th><th>Method</th><th>Currency</th><th>Payee</th><th>Status</th><th>Action</th></tr></thead><tbody>{templates.map((item) => <tr key={item.id}><td>{item.name}</td><td>{words(item.method)}</td><td>{item.currency}</td><td>{item.payeeName}</td><td><StatusBadge label={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "neutral"} /></td><td><Button disabled={acting} onClick={() => void toggleTemplate(item)} size="small" variant="outline">{item.active ? "Deactivate" : "Activate"}</Button></td></tr>)}</tbody></table></div>
      <form className="admin-form" onSubmit={createTemplate}><h3>New template</h3><label>Name<input required value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></label><label>Method<select value={templateDraft.method} onChange={(event) => setTemplateDraft({ ...templateDraft, method: event.target.value })}><option>BANK_TRANSFER</option><option>CASH_HANDOFF</option><option>OTHER</option></select></label><label>Currency<input maxLength={3} required value={templateDraft.currency} onChange={(event) => setTemplateDraft({ ...templateDraft, currency: event.target.value })} /></label><label>Payee name<input required value={templateDraft.payeeName} onChange={(event) => setTemplateDraft({ ...templateDraft, payeeName: event.target.value })} /></label><label>Provider<input value={templateDraft.provider} onChange={(event) => setTemplateDraft({ ...templateDraft, provider: event.target.value })} /></label><label>Account/reference<input value={templateDraft.accountReference} onChange={(event) => setTemplateDraft({ ...templateDraft, accountReference: event.target.value })} /></label><label className="admin-span">Instructions<textarea required rows={3} value={templateDraft.instructions} onChange={(event) => setTemplateDraft({ ...templateDraft, instructions: event.target.value })} /></label><label className="admin-span">Audit reason<textarea required rows={2} value={templateDraft.reason} onChange={(event) => setTemplateDraft({ ...templateDraft, reason: event.target.value })} /></label><Button disabled={acting} type="submit">Create template</Button></form>
    </section>

    <section className="admin-section" id="associates" aria-labelledby="associates-title"><div className="admin-section-heading"><div><p className="eyebrow">Internal directory</p><h2 id="associates-title">Payout associates</h2></div><span>{associates.length} contacts</span></div>
      <div className="operations-table-wrap"><table className="operations-table admin-table"><thead><tr><th>Business</th><th>Coverage</th><th>Methods</th><th>Currencies</th><th>Status</th><th>Action</th></tr></thead><tbody>{associates.map((item) => <tr key={item.id}><td>{item.businessName}</td><td>{item.countries.join(", ")}</td><td>{item.payoutMethods.map(words).join(", ")}</td><td>{item.currencies.join(", ")}</td><td><StatusBadge label={words(item.status)} tone={statusTone(item.status)} /></td><td><Button disabled={acting} onClick={() => void toggleAssociate(item)} size="small" variant="outline">{item.status === "ACTIVE" ? "Suspend" : "Activate"}</Button></td></tr>)}</tbody></table></div>
      <form className="admin-form" onSubmit={createAssociate}><h3>New associate</h3><label>Business name<input required value={associateDraft.businessName} onChange={(event) => setAssociateDraft({ ...associateDraft, businessName: event.target.value })} /></label><label>Country<input maxLength={2} required value={associateDraft.country} onChange={(event) => setAssociateDraft({ ...associateDraft, country: event.target.value })} /></label><label>City<input value={associateDraft.city} onChange={(event) => setAssociateDraft({ ...associateDraft, city: event.target.value })} /></label><label>Currency<input maxLength={3} required value={associateDraft.currency} onChange={(event) => setAssociateDraft({ ...associateDraft, currency: event.target.value })} /></label><label>Payout method<select value={associateDraft.payoutMethod} onChange={(event) => setAssociateDraft({ ...associateDraft, payoutMethod: event.target.value })}>{payoutMethods.map((item) => <option key={item}>{item}</option>)}</select></label><label>Operations email<input required type="email" value={associateDraft.email} onChange={(event) => setAssociateDraft({ ...associateDraft, email: event.target.value })} /></label><Button disabled={acting} type="submit">Create associate</Button></form>
    </section>

    <section className="admin-section" id="activity" aria-labelledby="activity-title"><div className="admin-section-heading"><div><p className="eyebrow">Immutable audit</p><h2 id="activity-title">Recent activity</h2></div><span>{events.length} events</span></div>
      <div className="operations-table-wrap"><table className="operations-table admin-table"><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Entity</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>{events.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{words(item.actionType)}</td><td>{item.actor?.fullName || item.actorUser?.fullName || item.actorRole || "System"}</td><td>{item.entityType ? `${item.entityType}${item.entityId ? ` · ${item.entityId.slice(0, 8)}` : ""}` : "—"}</td><td><StatusBadge label={words(item.outcome)} tone={statusTone(item.outcome)} /></td><td className="admin-reason">{item.reason || "—"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
