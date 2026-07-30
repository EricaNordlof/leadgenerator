'use strict';

const state = {
  user: null,
  csrfToken: '',
  gmail: { configured: false, connected: false, email: '' },
  business: null,
  view: 'today',
  leads: [],
  selectedLead: null,
  editingId: null,
  dashboard: null,
  integrations: null,
  searchTimer: null
};

const $ = (id) => document.getElementById(id);

const labels = {
  segments: {
    school: 'Skola & fritids', football: 'Fotbollsklubb', association: 'Förening', company: 'Företag',
    event: 'Eventbyrå', venue: 'Event-/konferenslokal', private: 'Privat arrangör', other: 'Övrig'
  },
  products: { children: 'Barn', adult: 'Vuxen', both: 'Barn + vuxen', unknown: 'Ej bedömt' },
  statuses: {
    new: 'Ny', qualified: 'Kvalificerad', contacted: 'Kontaktad', followup: 'Följ upp',
    quoted: 'Offert skickad', won: 'Bokad', lost: 'Inte aktuell'
  },
  occasions: {
    school_activity: 'Skolaktivitet / idrottsdag', birthday: 'Barnkalas',
    football_activity: 'Lagaktivitet / avslutning', association_day: 'Föreningsdag',
    kickoff: 'Kickoff / teambuilding', family_day: 'Familjedag', hen_party: 'Möhippa',
    stag_party: 'Svensexa', event: 'Event / festival', other: 'Annan aktivitet'
  }
};

async function api(path, options = {}) {
  const { timeoutMs = 25_000, signal, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (state.csrfToken && !['GET', 'HEAD'].includes((fetchOptions.method || 'GET').toUpperCase())) {
    headers.set('x-csrf-token', state.csrfToken);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api${path}`, {
      ...fetchOptions,
      headers,
      credentials: 'same-origin',
      signal: signal || controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') showLogin();
      throw new Error(data?.error || `Fel ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Servern svarade inte inom ${Math.round(timeoutMs / 1000)} sekunder. Försök igen.`);
    }
    if (error instanceof TypeError) {
      throw new Error('Kunde inte kontakta servern. Kontrollera anslutningen och försök igen.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function showToast(message, type = 'success') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function showLogin() {
  $('loginView').hidden = false;
  $('appView').hidden = true;
}

function showApp() {
  $('loginView').hidden = true;
  $('appView').hidden = false;
}

async function bootstrap() {
  const data = await api('/auth/me');
  state.user = data.user;
  state.csrfToken = data.csrfToken;
  state.gmail = data.gmail;
  state.business = data.business;
  showApp();

  const results = await Promise.allSettled([loadDashboard(), loadIntegrations(), loadLeads()]);
  const failures = results.filter((result) => result.status === 'rejected');

  updateGmailUi();
  detectLegacyData();

  if (failures.length) {
    const message = failures[0].reason?.message || 'Vissa data kunde inte laddas.';
    showToast(`Du är inloggad, men ${message.toLowerCase()}`, 'error');
  }
}

async function loadDashboard() {
  state.dashboard = await api('/dashboard');
  const stats = state.dashboard.stats;
  $('statToday').textContent = stats.today;
  $('statHot').textContent = stats.hot;
  $('statDue').textContent = stats.due;
  $('statQuoted').textContent = stats.quoted;
  $('statWon').textContent = stats.won;
  $('statTotal').textContent = stats.total;
  renderRuns(state.dashboard.runs || []);
}

async function loadIntegrations() {
  state.integrations = await api('/integrations/status');
  state.gmail = state.integrations.gmail;
  updateGmailUi();
  const booking = state.integrations.booking;
  $('bookingStatusText').textContent = booking.webhookConfigured
    ? 'Webhook är ansluten. Offert- och bokningsunderlag skickas direkt till bokningssystemet.'
    : 'Underlag sparas i databasen och öppnas som en förifylld länk i bokningsappen.';
  const discovery = state.integrations.discovery;
  const sources = [discovery.skolverket ? 'Skolverket' : '', discovery.openStreetMap ? 'OpenStreetMap' : ''].filter(Boolean).join(' + ');
  $('discoveryStatusText').textContent = `${sources || 'Ingen standardkälla'} är aktiv. OpenStreetMap delas i ${discovery.overpassTiles || 1} områden och kan växla mellan ${discovery.overpassEndpoints || 1} servrar. Skolverket granskar upp till ${discovery.skolverketDetailBudget || 0} aktiva skolenheter per körning. Max ${discovery.maxNew || 80} nya leads per körning. Daglig körning: ${discovery.dailySchedule}.`;
}

function updateGmailUi() {
  const connected = state.gmail.connected;
  $('mailboxBadge').textContent = connected ? `Gmail: ${state.gmail.email}` : 'Gmail ej ansluten';
  $('mailboxBadge').className = `status-pill ${connected ? 'success' : 'neutral'}`;
  $('gmailStatusText').textContent = connected
    ? `Ansluten som ${state.gmail.email}. Utkast skapas i brevlådan men skickas aldrig automatiskt.`
    : state.gmail.configured
      ? 'OAuth är konfigurerat men ingen brevlåda är ansluten.'
      : 'GMAIL_CLIENT_ID och GMAIL_CLIENT_SECRET måste läggas in i Render först.';
  $('connectGmailBtn').hidden = connected;
  $('disconnectGmailBtn').hidden = !connected;
  $('testGmailBtn').hidden = !connected;
  $('connectGmailQuickBtn').hidden = connected;
}

function queryString() {
  const params = new URLSearchParams();
  params.set('view', state.view === 'today' ? 'today' : 'pipeline');
  params.set('sort', $('sortFilter').value);
  if ($('searchInput').value.trim()) params.set('search', $('searchInput').value.trim());
  if ($('segmentFilter').value !== 'all') params.set('segment', $('segmentFilter').value);
  if ($('productFilter').value !== 'all') params.set('product', $('productFilter').value);
  if ($('statusFilter').value !== 'all') params.set('status', $('statusFilter').value);
  return params.toString();
}

async function loadLeads() {
  const data = await api(`/leads?${queryString()}`);
  state.leads = data.leads || [];
  renderLeads();
}

function renderLeads() {
  $('listTitle').textContent = state.view === 'today' ? 'Nya leads att granska' : 'Gemensam försäljningspipeline';
  $('listEyebrow').textContent = state.view === 'today' ? 'Dagens arbetslista' : 'Alla aktiva leads';
  $('listCount').textContent = state.leads.length;
  $('emptyState').hidden = state.leads.length > 0;
  $('leadRows').innerHTML = state.leads.map((lead) => `
    <tr data-id="${escapeHtml(lead.id)}">
      <td class="organization-cell"><strong>${escapeHtml(lead.organization)}</strong><small>${escapeHtml([lead.city, lead.contact_name || lead.email || lead.website].filter(Boolean).join(' · '))}</small></td>
      <td><span class="segment-badge">${escapeHtml(labels.segments[lead.segment] || 'Övrig')}</span></td>
      <td><span class="product-badge">${escapeHtml(labels.products[lead.product_type] || 'Ej bedömt')}</span><small>${escapeHtml(labels.occasions[lead.occasion] || '')}</small></td>
      <td><span class="score ${temperature(lead.score)}">${lead.score}</span></td>
      <td><span class="status-badge">${escapeHtml(labels.statuses[lead.status] || lead.status)}</span></td>
    </tr>
  `).join('');
  document.querySelectorAll('#leadRows tr').forEach((row) => row.addEventListener('click', () => openLead(row.dataset.id)));
}

function temperature(score) {
  if (Number(score) >= 85) return 'hot';
  if (Number(score) >= 65) return 'warm';
  return 'cold';
}

function temperatureLabel(score) {
  if (Number(score) >= 85) return 'Het lead';
  if (Number(score) >= 65) return 'Varm lead';
  return 'Kall lead';
}

async function openLead(id) {
  const data = await api(`/leads/${id}`);
  state.selectedLead = data.lead;
  const lead = state.selectedLead;
  $('detailOrganization').textContent = lead.organization;
  $('detailMeta').textContent = [lead.city, lead.contact_name, lead.email].filter(Boolean).join(' · ') || 'Kontaktväg saknas';
  $('detailScore').textContent = lead.score;
  $('detailScore').className = `big-score ${temperature(lead.score)}`;
  $('detailTemperature').textContent = temperatureLabel(lead.score);
  $('detailTemperature').className = `status-pill ${temperature(lead.score)}`;
  $('detailRecommendation').textContent = recommendationText(lead);
  $('scoreReasons').innerHTML = (lead.score_reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
  $('detailSegment').textContent = labels.segments[lead.segment] || lead.segment;
  $('detailOccasion').textContent = [labels.occasions[lead.occasion], lead.event_date ? formatDate(lead.event_date) : '', lead.participants ? `${lead.participants} deltagare` : ''].filter(Boolean).join(' · ');
  $('detailContact').textContent = [lead.contact_name, lead.email, lead.phone].filter(Boolean).join(' · ') || 'Saknas';
  $('detailWebsite').innerHTML = lead.website ? `<a href="${escapeHtml(safeUrl(lead.website))}" target="_blank" rel="noopener">Öppna webbplats ↗</a>` : 'Saknas';
  $('detailSource').innerHTML = lead.source_url ? `<a href="${escapeHtml(safeUrl(lead.source_url))}" target="_blank" rel="noopener">${escapeHtml(lead.source_type)} ↗</a><small>${escapeHtml(lead.source_license || '')}</small>` : escapeHtml(lead.source_type || 'Manuell');
  $('detailOpportunity').textContent = lead.opportunity || 'Kvalificera behov, datum och gruppstorlek.';
  $('draftSubject').value = '';
  $('draftBody').value = '';
  $('handoffLink').hidden = true;
  $('detailDialog').showModal();
}

function recommendationText(lead) {
  const participants = Number(lead.participants || 0);
  const count = !participants ? 6 : participants <= 4 ? 2 : participants <= 8 ? 4 : participants <= 14 ? 6 : participants <= 20 ? 8 : participants <= 26 ? 10 : 12;
  const rotation = participants > count ? ' med rotationsupplägg' : '';
  if (lead.product_type === 'children') return `${count} barnbollar${rotation}`;
  if (lead.product_type === 'adult') return `${count} vuxenbollar${rotation}`;
  if (lead.product_type === 'both') return `${count} barnbollar + ${count} vuxenbollar med grupper efter ålder`;
  return `${count} bollar preliminärt – kontrollera ålder och vikt`;
}

async function previewDraft() {
  if (!state.selectedLead) return;
  const data = await api(`/leads/${state.selectedLead.id}/draft-preview`, {
    method: 'POST', body: JSON.stringify({ type: $('draftType').value })
  });
  $('draftSubject').value = data.draft.subject;
  $('draftBody').value = data.draft.body;
}

async function createGmailDraft() {
  if (!state.gmail.connected) {
    showToast('Anslut Gmail under Integrationer först.', 'error');
    setView('integrations');
    $('detailDialog').close();
    return;
  }
  if (!state.selectedLead?.email) return showToast('Leaden saknar e-postadress.', 'error');

  let subject = $('draftSubject').value.trim();
  let body = $('draftBody').value.trim();

  // Om båda fälten är tomma skapas mallen först. Har användaren fyllt i ett av
  // fälten stoppar vi i stället, så att ingen egen text skrivs över av misstag.
  if (!subject && !body) {
    await previewDraft();
    subject = $('draftSubject').value.trim();
    body = $('draftBody').value.trim();
  }
  if (!subject || !body) {
    return showToast('Både ämnesrad och meddelande måste vara ifyllda.', 'error');
  }

  const button = $('createGmailDraftBtn');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Skapar i Gmail…';

  try {
    const data = await api(`/leads/${state.selectedLead.id}/gmail-draft`, {
      method: 'POST',
      body: JSON.stringify({
        type: $('draftType').value,
        subject,
        body
      })
    });
    $('draftSubject').value = data.draft.subject;
    $('draftBody').value = data.draft.body;
    showToast('Det redigerade utkastet skapades i Gmail. Ingenting har skickats.');
    await Promise.all([loadLeads(), loadDashboard()]);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function createHandoff(mode) {
  if (!state.selectedLead) return;
  const data = await api(`/leads/${state.selectedLead.id}/convert`, {
    method: 'POST', body: JSON.stringify({ mode })
  });
  const link = $('handoffLink');
  link.href = data.handoff.external_url;
  link.textContent = mode === 'booking' ? 'Öppna bokningsunderlaget ↗' : 'Öppna offertunderlaget ↗';
  link.hidden = false;
  showToast(mode === 'booking' ? 'Bokningsunderlag skapat.' : 'Offertunderlag skapat.');
  await Promise.all([loadLeads(), loadDashboard()]);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('integrationsView').hidden = view !== 'integrations';
  $('leadsView').hidden = view === 'integrations';
  if (view !== 'integrations') loadLeads().catch(handleError);
}

async function runDiscovery() {
  const buttons = [$('runDiscoveryBtn'), $('runDiscoveryIntegrationBtn')];
  buttons.forEach((button) => { button.disabled = true; button.textContent = 'Hämtar…'; });
  try {
    const result = await api('/discovery/run', { method: 'POST', body: '{}', timeoutMs: 300_000 });
    if (result.busy) {
      showToast(result.message || 'En leadinsamling körs redan.', 'error');
      return;
    }
    const failed = result.results.filter((item) => item.status === 'failed').length;
    const partial = result.results.filter((item) => item.status === 'partial').length;
    const suffix = failed ? ` ${failed} källa misslyckades.` : partial ? ` ${partial} källa blev delvis klar.` : '';
    showToast(`${result.newLeads} nya leads lades till.${suffix}`, failed ? 'error' : 'success');
    state.view = 'today';
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.view === 'today'));
    $('integrationsView').hidden = true;
    $('leadsView').hidden = false;
    await Promise.all([loadDashboard(), loadLeads(), loadIntegrations()]);
  } finally {
    buttons.forEach((button) => { button.disabled = false; button.textContent = button.id === 'runDiscoveryBtn' ? 'Hämta leads nu' : 'Kör insamling nu'; });
  }
}

function parseJsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sourceLabel(source) {
  return ({ skolverket: 'Skolverket', openstreetmap: 'OpenStreetMap', 'official-feeds': 'Officiella feeds' })[source] || source;
}

function runStatusLabel(status) {
  return ({ completed: 'Klar', partial: 'Delvis klar', failed: 'Misslyckad', running: 'Körs' })[status] || status;
}

function renderRuns(runs) {
  $('runList').innerHTML = runs.length ? runs.map((run) => {
    const errors = parseJsonValue(run.errors, []);
    const details = parseJsonValue(run.details, {});
    const statusClass = run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'partial' ? 'warm' : 'neutral';
    const detailParts = [];
    if (details.detailScanned) detailParts.push(`${details.detailScanned} skolor granskade`);
    if (details.completedTasks) detailParts.push(`${details.completedTasks}/${details.tasks} OSM-frågor klara`);
    if (details.endpointsUsed?.length) detailParts.push(`servrar: ${details.endpointsUsed.join(', ')}`);
    if (run.duration_ms) detailParts.push(`${Math.round(run.duration_ms / 1000)} s`);
    const diagnostic = [...detailParts, ...errors].filter(Boolean);
    return `
      <div class="run-item run-item-v33">
        <div><strong>${escapeHtml(sourceLabel(run.source))}</strong><small>${formatDateTime(run.started_at)} · ${run.found_count || 0} hittade</small></div>
        <div><span class="status-pill ${statusClass}">${escapeHtml(runStatusLabel(run.status))}</span></div>
        <div><strong>${run.inserted_count}</strong><small>nya</small></div>
        <div><strong>${run.updated_count}</strong><small>uppdaterade</small></div>
        ${diagnostic.length ? `<details class="run-diagnostics"><summary>Diagnostik</summary><ul>${diagnostic.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
      </div>
    `;
  }).join('') : '<p class="muted">Ingen automatisk körning ännu.</p>';
}

function openLeadForm(lead = null) {
  state.editingId = lead?.id || null;
  $('leadDialogTitle').textContent = lead ? 'Redigera bumperball-lead' : 'Ny bumperball-lead';
  $('leadForm').reset();
  const values = lead || { city: 'Malmö', segment: 'school', occasion: 'school_activity', product_type: 'children', intent: 'medium', status: 'new', source_type: 'manual' };
  for (const [key, value] of Object.entries(values)) {
    const field = $('leadForm').elements.namedItem(key);
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else if (field.type === 'date' && value) field.value = String(value).slice(0, 10);
    else field.value = value ?? '';
  }
  $('leadDialog').showModal();
}

function formPayload(form) {
  const data = new FormData(form);
  return {
    organization: data.get('organization'), segment: data.get('segment'), city: data.get('city'),
    contact_name: data.get('contact_name'), email: data.get('email'), phone: data.get('phone'),
    website: data.get('website'), source_url: data.get('source_url'), source_type: state.editingId ? (state.selectedLead?.source_type || 'manual') : 'manual',
    source_external_id: state.editingId ? (state.selectedLead?.source_external_id || '') : '',
    source_license: state.editingId ? (state.selectedLead?.source_license || '') : '',
    occasion: data.get('occasion'), product_type: data.get('product_type'),
    participants: data.get('participants') ? Number(data.get('participants')) : null,
    event_date: data.get('event_date') || null, intent: data.get('intent'),
    location_fit: /malmö/i.test(data.get('city') || '') ? 'malmo' : (data.get('city') ? 'skane' : 'unknown'),
    recurring: data.get('recurring') === 'on', opportunity: data.get('opportunity'),
    status: data.get('status'), followup: data.get('followup') || null, notes: data.get('notes')
  };
}

async function saveLead(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  if (state.editingId) {
    await api(`/leads/${state.editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    await api('/leads', { method: 'POST', body: JSON.stringify(payload) });
  }
  $('leadDialog').close();
  showToast('Leaden sparades.');
  await Promise.all([loadLeads(), loadDashboard()]);
}

async function deleteLead() {
  if (!state.selectedLead || !confirm(`Ta bort ${state.selectedLead.organization}?`)) return;
  await api(`/leads/${state.selectedLead.id}`, { method: 'DELETE' });
  $('detailDialog').close();
  showToast('Leaden togs bort.');
  await Promise.all([loadLeads(), loadDashboard()]);
}

function connectGmail() {
  if (!state.gmail.configured) return showToast('Lägg först in Gmail OAuth-uppgifterna i Render.', 'error');
  location.href = '/api/integrations/gmail/connect';
}

async function disconnectGmail() {
  if (!confirm('Koppla bort Gmail från leadgeneratorn?')) return;
  await api('/integrations/gmail', { method: 'DELETE' });
  await loadIntegrations();
  showToast('Gmail kopplades bort.');
}

async function createGmailTestDraft() {
  const button = $('testGmailBtn');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Skapar test…';
  try {
    const data = await api('/integrations/gmail/test-draft', { method: 'POST', body: '{}' });
    showToast(`Testutkast skapat i ${data.draft.recipient}. Ingenting har skickats.`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function detectLegacyData() {
  try {
    const legacy = JSON.parse(localStorage.getItem('offroad-bumpis-leads-v2') || 'null');
    $('legacyMigrationCard').hidden = !Array.isArray(legacy) || legacy.length === 0;
  } catch { $('legacyMigrationCard').hidden = true; }
}

async function migrateLegacyData() {
  const legacy = JSON.parse(localStorage.getItem('offroad-bumpis-leads-v2') || '[]');
  let imported = 0;
  for (const item of legacy) {
    try {
      await api('/leads', {
        method: 'POST',
        body: JSON.stringify({
          organization: item.organization || item.company || 'Namnlös lead', segment: item.segment || 'other', city: item.city || '',
          contact_name: item.contactName || item.contact_name || '', email: item.email || '', phone: item.phone || '', website: item.website || '',
          source_url: item.sourceUrl || item.source_url || item.website || '', source_type: 'legacy-v2', source_external_id: item.id || '', source_license: '',
          occasion: item.occasion || 'other', product_type: item.productType || item.product_type || 'unknown', participants: item.participants || null,
          event_date: item.eventDate || item.event_date || null, intent: item.intent || 'unknown', location_fit: item.locationFit || item.location_fit || 'unknown',
          recurring: Boolean(item.recurring), opportunity: item.opportunity || item.need || '', status: item.status || 'new', followup: item.followup || null, notes: item.notes || ''
        })
      });
      imported += 1;
    } catch (error) { console.warn('Kunde inte importera gammal lead:', error.message); }
  }
  localStorage.removeItem('offroad-bumpis-leads-v2');
  $('legacyMigrationCard').hidden = true;
  showToast(`${imported} gamla leads importerades till databasen.`);
  await Promise.all([loadDashboard(), loadLeads()]);
}

function copyDraft() {
  const text = `${$('draftSubject').value}\n\n${$('draftBody').value}`.trim();
  if (!text) return showToast('Förhandsvisa ett utkast först.', 'error');
  navigator.clipboard.writeText(text).then(() => showToast('Utkastet kopierades.'));
}

function safeUrl(value) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).toString(); }
  catch { return '#'; }
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function handleError(error) {
  console.error(error);
  showToast(error.message || 'Ett fel inträffade.', 'error');
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = $('loginSubmit');
  const originalLabel = submitButton.textContent;

  $('loginError').hidden = true;
  $('loginError').textContent = '';
  $('loginStatus').textContent = 'Kontrollerar inloggningen…';
  submitButton.disabled = true;
  submitButton.textContent = 'Loggar in…';

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      })
    });
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    $('loginStatus').textContent = 'Inloggningen lyckades. Laddar leadgeneratorn…';
    await bootstrap();
    $('loginStatus').textContent = '';
  } catch (error) {
    showLogin();
    $('loginStatus').textContent = '';
    $('loginError').textContent = error.message || 'Inloggningen misslyckades.';
    $('loginError').hidden = false;
    $('loginPassword').focus();
    $('loginPassword').select();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

$('logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST', body: '{}' }); state.user = null; state.csrfToken = ''; showLogin(); });
$('runDiscoveryBtn').addEventListener('click', () => runDiscovery().catch(handleError));
$('runDiscoveryIntegrationBtn').addEventListener('click', () => runDiscovery().catch(handleError));
$('addLeadBtn').addEventListener('click', () => openLeadForm());
$('leadForm').addEventListener('submit', (event) => saveLead(event).catch(handleError));
$('closeDetailBtn').addEventListener('click', () => $('detailDialog').close());
$('editLeadBtn').addEventListener('click', () => { const lead = state.selectedLead; $('detailDialog').close(); openLeadForm(lead); });
$('deleteLeadBtn').addEventListener('click', () => deleteLead().catch(handleError));
$('previewDraftBtn').addEventListener('click', () => previewDraft().catch(handleError));
$('createGmailDraftBtn').addEventListener('click', () => createGmailDraft().catch(handleError));
$('copyDraftBtn').addEventListener('click', copyDraft);
$('createQuoteBtn').addEventListener('click', () => createHandoff('quote').catch(handleError));
$('createBookingBtn').addEventListener('click', () => createHandoff('booking').catch(handleError));
$('connectGmailBtn').addEventListener('click', connectGmail);
$('connectGmailQuickBtn').addEventListener('click', connectGmail);
$('disconnectGmailBtn').addEventListener('click', () => disconnectGmail().catch(handleError));
$('testGmailBtn').addEventListener('click', () => createGmailTestDraft().catch(handleError));
$('migrateLegacyBtn').addEventListener('click', () => migrateLegacyData().catch(handleError));

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
['segmentFilter', 'productFilter', 'statusFilter', 'sortFilter'].forEach((id) => $(id).addEventListener('change', () => loadLeads().catch(handleError)));
$('searchInput').addEventListener('input', () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => loadLeads().catch(handleError), 300);
});

bootstrap().catch((error) => {
  console.info('Ingen aktiv session:', error.message);
  showLogin();
});
