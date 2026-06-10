const STORES = ['Central Market','Movenpick Hotel','Street Mall'];
const STORAGE_KEY = 'kul_submissions_v1';
const ADMIN_PASS = '1234';
const LEGACY_PAGE_SIZE = 5;
let legacyPage = 1;
// Cache of live Google Sheet rows fetched via doGet; null means not yet fetched
let _liveDataCache = null;
let legacySelectedIds = new Set();
let historyShowAll = false;

function $(id){return document.getElementById(id)}

function getToday(){
  // Return today's date in Malaysia timezone (Asia/Kuala_Lumpur) as YYYY-MM-DD
  const tz = 'Asia/Kuala_Lumpur';
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'});
  const [{value: year},,{value: month},,{value: day}] = formatter.formatToParts(new Date());
  return `${year}-${month}-${day}`;
}

function timeNow(){
  const d=new Date();
  return d.toTimeString().slice(0,8);
}

function formatDate(iso){
  if(!iso) return '-';
  try{
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }catch(e){return iso}
}

function loadSubmissions(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch(e){return[]}
}

function saveSubmissions(arr){localStorage.setItem(STORAGE_KEY,JSON.stringify(arr))}

function init(){
  // populate store select if needed
  const storeSelect = $('storeSelect');
  storeSelect.innerHTML = '<option value="" selected>Pick your store</option>' + STORES.map(s=>`<option value="${s}">${s}</option>`).join('');

  // initial progressive state: show only store select
  $('salesQuestion').classList.add('hidden');
  $('salesFields').classList.add('hidden');
  $('noSalesFields').classList.add('hidden');
  $('b2bFields').classList.add('hidden');
  $('submitBtn').classList.add('hidden');

  // bindings
  document.querySelectorAll('input[name=madeSales]').forEach(r=>r.addEventListener('change', toggleSalesFields));
  $('storeSelect').addEventListener('change', onStoreSelected);
  $('imageInput').addEventListener('change', handleImage);
  $('reportForm').addEventListener('submit', handleSubmit);
  $('newReportBtn').addEventListener('click', resetForm);

  // export/import UI
  // populate exportStore select
  const exportStoreSel = $('exportStore');
  if(exportStoreSel){
    exportStoreSel.innerHTML = '<option value="ALL">All Stores</option>' + STORES.map(s=>`<option value="${s}">${s}</option>`).join('');
    $('exportAllBtn').addEventListener('click', ()=>exportCSV({all:true}));
    $('exportRangeBtn').addEventListener('click', ()=>{
      const range = $('exportRange').value;
      const store = $('exportStore').value;
      if(range==='custom'){
        const from = $('exportFrom').value; const to = $('exportTo').value;
        if(!from || !to){ alert('Please pick both From and To dates for custom range.'); return }
        exportCSV({startDate: from, endDate: to, store});
      } else if(range==='today'){
        exportCSV({startDate: getToday(), endDate: getToday(), store});
      } else if(range==='this_week'){
        const w = currentWeekRange(); exportCSV({startDate:w[0], endDate:w[1], store});
      } else if(range==='this_month'){
        const m = currentMonthRange(); exportCSV({startDate:m[0], endDate:m[1], store});
      } else if(range==='all'){
        exportCSV({all:true, store});
      }
    });
    $('exportRange').addEventListener('change', function(){
      if(this.value==='custom'){ $('exportFrom').classList.remove('hidden'); $('exportTo').classList.remove('hidden'); }
      else { $('exportFrom').classList.add('hidden'); $('exportTo').classList.add('hidden'); }
    });
    // re-render dashboard immediately when store filter changes
    exportStoreSel.addEventListener('change', function(){ renderDashboard(); });
    const importBtn = $('importBtn'); if(importBtn) importBtn.addEventListener('click', importCSV);
  }

  // admin
  const adminModal = $('adminModal');
  $('adminBtn').addEventListener('click', ()=>adminModal.classList.add('show'));
  $('adminCancel').addEventListener('click', ()=>adminModal.classList.remove('show'));
  $('adminEnter').addEventListener('click', adminEnter);
  $('closeAdmin').addEventListener('click', closeAdmin);
  // close modal when clicking outside the modal card
  adminModal.addEventListener('click', function(e){ if(e.target === adminModal) adminModal.classList.remove('show'); });
  const editModalEl = $('editModal');
  if(editModalEl){ editModalEl.addEventListener('click', function(e){ if(e.target === editModalEl) editModalEl.classList.remove('show'); }); }

  // Admin tabs (Dashboard / History / B2B / Existing / Settings)
  const tabDashboard = $('tabDashboard');
  const tabHistory = $('tabHistory');
  const tabB2B = $('tabB2B');
  const tabExisting = $('tabExisting');
  const tabSettings = $('tabSettings');
  if(tabDashboard && tabHistory && tabB2B && tabExisting && tabSettings){
    tabDashboard.addEventListener('click', ()=> switchAdminTab('dashboard'));
    tabHistory.addEventListener('click', ()=> switchAdminTab('history'));
    tabB2B.addEventListener('click', ()=> switchAdminTab('b2b'));
    tabExisting.addEventListener('click', ()=> switchAdminTab('existing'));
    tabSettings.addEventListener('click', ()=> switchAdminTab('settings'));
    // initialize active tab
    switchAdminTab('dashboard');
  }

  // History controls wiring
  const histApply = $('histApplyBtn'); if(histApply) histApply.addEventListener('click', ()=> renderHistory());
  const addRecordBtn = $('addRecordBtn'); if(addRecordBtn) addRecordBtn.addEventListener('click', openAddRecordModal);
  const viewAllHistoryBtn = $('viewAllHistoryBtn'); if(viewAllHistoryBtn) viewAllHistoryBtn.addEventListener('click', () => { historyShowAll = true; renderHistory(); });
  const viewLessHistoryBtn = $('viewLessHistoryBtn'); if(viewLessHistoryBtn) viewLessHistoryBtn.addEventListener('click', () => { historyShowAll = false; renderHistory(); });
  const histRangeSel = $('histRange'); if(histRangeSel) { histRangeSel.addEventListener('change', function(){ if(this.value==='custom'){ $('histFrom').classList.remove('hidden'); $('histTo').classList.remove('hidden'); } else { $('histFrom').classList.add('hidden'); $('histTo').classList.add('hidden'); } }); if(histRangeSel.value==='custom'){ $('histFrom').classList.remove('hidden'); $('histTo').classList.remove('hidden'); } else { $('histFrom').classList.add('hidden'); $('histTo').classList.add('hidden'); } }
  const histExport = $('histExportBtn'); if(histExport) histExport.addEventListener('click', function(){
    // build export options similar to filters
    const store = $('histStore').value || 'ALL';
    const range = $('histRange').value || 'all';
    const from = $('histFrom').value; const to = $('histTo').value;
    if(range==='custom' && (!from || !to)){ alert('Please select From and To dates for custom range'); return }
    if(range==='custom'){ exportSalesHistoryCSV({startDate: from, endDate: to, store}); }
    else if(range==='today'){ exportSalesHistoryCSV({startDate: getToday(), endDate: getToday(), store}); }
    else if(range==='this_week'){ const w=currentWeekRange(); exportSalesHistoryCSV({startDate:w[0], endDate:w[1], store}); }
    else if(range==='this_month'){ const m=currentMonthRange(); exportSalesHistoryCSV({startDate:m[0], endDate:m[1], store}); }
    else if(range==='this_year'){ const y=currentYearRange(); exportSalesHistoryCSV({startDate:y[0], endDate:y[1], store}); }
    else { exportSalesHistoryCSV({all:true, store}); }
  });

  const b2bRangeSel = $('b2bRange'); if(b2bRangeSel) b2bRangeSel.addEventListener('change', function(){ if(this.value==='custom'){ $('b2bFrom').classList.remove('hidden'); $('b2bTo').classList.remove('hidden'); } else { $('b2bFrom').classList.add('hidden'); $('b2bTo').classList.add('hidden'); } });
  const b2bApply = $('b2bApplyBtn'); if(b2bApply) b2bApply.addEventListener('click', ()=> renderB2B());
  const b2bExport = $('b2bExportBtn'); if(b2bExport) b2bExport.addEventListener('click', function(){
    const range = $('b2bRange').value || 'all';
    const from = $('b2bFrom').value; const to = $('b2bTo').value;
    if(range==='custom' && (!from || !to)){ alert('Please select From and To dates for custom range'); return }
    if(range==='custom'){ exportCSV({startDate: from, endDate: to, store: 'B2B'}); }
    else if(range==='today'){ exportCSV({startDate: getToday(), endDate: getToday(), store: 'B2B'}); }
    else if(range==='this_week'){ const w=currentWeekRange(); exportCSV({startDate:w[0], endDate:w[1], store: 'B2B'}); }
    else if(range==='this_month'){ const m=currentMonthRange(); exportCSV({startDate:m[0], endDate:m[1], store: 'B2B'}); }
    else if(range==='this_year'){ const y=currentYearRange(); exportCSV({startDate:y[0], endDate:y[1], store: 'B2B'}); }
    else { exportCSV({all:true, store: 'B2B'}); }
  });

  const legacyRange = $('legacyRange'); if(legacyRange) legacyRange.addEventListener('change', function(){ if(this.value==='custom'){ $('legacyFrom').classList.remove('hidden'); $('legacyTo').classList.remove('hidden'); } else { $('legacyFrom').classList.add('hidden'); $('legacyTo').classList.add('hidden'); } });
  const legacyApply = $('legacyApplyBtn'); if(legacyApply) legacyApply.addEventListener('click', ()=> renderLegacy());

  // legacy manual entry removed from UI; CSV-only workflow keeps import wiring below

  // CSV import wiring for Sales History
  const legacyCsvFile = $('legacyCsvFile'); const legacyCsvPreviewBtn = $('legacyCsvPreviewBtn');
  if(legacyCsvPreviewBtn && legacyCsvFile){
    legacyCsvPreviewBtn.addEventListener('click', ()=> handleLegacyCSVPreview());
    legacyCsvFile.addEventListener('change', ()=> handleLegacyCSVPreview());
    $('legacyCsvCancel').addEventListener('click', ()=>{ $('legacyCsvPreview').innerHTML=''; $('legacyCsvMsg').textContent=''; $('legacyCsvConfirm').disabled=true; if(legacyCsvFile) legacyCsvFile.value=''; $('legacyCsvModal').classList.remove('show'); });
    $('legacyCsvConfirm').addEventListener('click', ()=> { confirmLegacyCSVImport(); $('legacyCsvModal').classList.remove('show'); });
  }

  // open CSV modal from button in UI
  const openLegacyCsvModalBtn = $('openLegacyCsvModal'); if(openLegacyCsvModalBtn){ openLegacyCsvModalBtn.addEventListener('click', ()=>{ const m=$('legacyCsvModal'); if(m) m.classList.add('show'); }); }

  // close modal when clicking outside
  const legacyCsvModalEl = $('legacyCsvModal'); if(legacyCsvModalEl){ legacyCsvModalEl.addEventListener('click', function(e){ if(e.target === legacyCsvModalEl) legacyCsvModalEl.classList.remove('show'); }); }

  // Settings wiring
  const exportBackupBtn = $('exportBackupBtn'); if(exportBackupBtn) exportBackupBtn.addEventListener('click', ()=> exportFullBackup());
  const resetDataBtn = $('resetDataBtn'); if(resetDataBtn) resetDataBtn.addEventListener('click', ()=> $('resetModal').classList.add('show'));
  const resetCancel = $('resetCancel'); if(resetCancel) resetCancel.addEventListener('click', ()=> $('resetModal').classList.remove('show'));
  const resetConfirmBtn = $('resetConfirmBtn'); if(resetConfirmBtn) resetConfirmBtn.addEventListener('click', ()=> performResetIfAuthorized());

  // update system info initially
  updateSystemInfo();


  renderMissingHints();

  // Existing Bookkeeping UI simplified (no accordions)
}

function initExistingAccordions(){
  const container = $('existingView'); if(!container) return;
  const details = Array.from(container.querySelectorAll('details.collapsible'));
  if(!details.length) return;

  // close a detail: hide panel and remove open class
  function closeDetail(d){
    const panel = d.querySelector('.panel'); const summary = d.querySelector('summary');
    if(panel){ panel.classList.add('hidden'); panel.style.maxHeight = '0px'; }
    d.classList.remove('open'); if(summary) summary.setAttribute('aria-expanded','false');
  }

  // open a detail and close others
  function openDetail(d){
    details.forEach(x=>{ if(x!==d) closeDetail(x); });
    const panel = d.querySelector('.panel'); const summary = d.querySelector('summary');
    if(panel){ panel.classList.remove('hidden'); // force reflow then set maxHeight for transition
      panel.style.maxHeight = panel.scrollHeight + 'px';
    }
    d.classList.add('open'); if(summary) summary.setAttribute('aria-expanded','true');
  }

  // initialize each details: ensure panel hidden and attach handlers
  details.forEach(d=>{
    const summary = d.querySelector('summary'); const panel = d.querySelector('.panel');
    if(!summary || !panel) return;
    panel.classList.add('hidden'); panel.style.overflow = 'hidden'; panel.style.maxHeight = '0px';
    summary.setAttribute('role','button'); summary.setAttribute('aria-expanded','false'); summary.setAttribute('tabindex','0');

    // click toggles
    summary.addEventListener('click', function(e){ e.preventDefault(); if(d.classList.contains('open')) closeDetail(d); else openDetail(d); });

    // keyboard toggle (Enter / Space)
    summary.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){ e.preventDefault(); if(d.classList.contains('open')) closeDetail(d); else openDetail(d); } });
  });

  // keep panels sized correctly when window resizes
  window.addEventListener('resize', ()=>{ details.forEach(d=>{ if(d.classList.contains('open')){ const p=d.querySelector('.panel'); if(p) p.style.maxHeight = p.scrollHeight + 'px'; } }) });
}

function onStoreSelected(){
  const store = $('storeSelect').value;
  // if no value chosen, keep question hidden
  if(!store){ $('salesQuestion').classList.add('hidden'); return }
  // hide any store selection error when user picks a store
  const storeErr = $('storeError'); if(storeErr) storeErr.classList.add('hidden');
  // show sales question and reset radios
  $('salesQuestion').classList.remove('hidden');
  document.querySelectorAll('input[name=madeSales]').forEach(i=>{ i.checked = false });
  // hide fields until radio chosen
  $('salesFields').classList.add('hidden'); $('noSalesFields').classList.add('hidden'); $('b2bFields').classList.add('hidden'); $('submitBtn').classList.add('hidden');
  updateFormForStore();
}

function toggleSalesFields(){
  const val = document.querySelector('input[name=madeSales]:checked').value;
  if(val==='yes'){
    $('salesFields').classList.remove('hidden');
    $('noSalesFields').classList.add('hidden');
    $('submitBtn').classList.remove('hidden');
  }else{
    $('salesFields').classList.add('hidden');
    $('noSalesFields').classList.remove('hidden');
    $('submitBtn').classList.remove('hidden');
  }
  updateFormForStore();
}

function toggleB2BFields(){
  const store = $('storeSelect').value;
  // only show B2B fields when B2B is selected and salesFields visible
  if(store==='B2B' && !$('salesFields').classList.contains('hidden')) $('b2bFields').classList.remove('hidden');
  else $('b2bFields').classList.add('hidden');
}

function updateFormForStore(){
  const store = $('storeSelect').value;
  const madeEl = document.querySelector('input[name=madeSales]:checked');
  const made = madeEl? madeEl.value : null;
  const breakdown = $('breakdownFields');
  const proof = $('proofUpload');
  const b2b = $('b2bFields');

  if(made !== 'yes'){
    // when no sales or no selection, hide store-specific fields
    breakdown && breakdown.classList.remove('hidden');
    proof && proof.classList.remove('hidden');
    b2b && b2b.classList.add('hidden');
    return;
  }

  if(store==='TikTok'){
    // only total and remarks
    if(breakdown) breakdown.classList.add('hidden');
    if(proof) { proof.classList.add('hidden'); currentImageBase64s = []; if($('imageInput')) $('imageInput').value=''; if($('imagePreview')) $('imagePreview').innerHTML=''; }
    if(b2b) b2b.classList.add('hidden');
  } else if(store==='B2B'){
    // show client fields and proof upload, hide breakdown
    if(breakdown) breakdown.classList.add('hidden');
    if(proof) proof.classList.remove('hidden');
    if(b2b) b2b.classList.remove('hidden');
  } else {
    // retail stores: show breakdown and proof
    if(breakdown) breakdown.classList.remove('hidden');
    if(proof) proof.classList.remove('hidden');
    if(b2b) b2b.classList.add('hidden');
  }
}

let currentImageBase64s = [];
function handleImage(e){
  const files = Array.from(e.target.files || []).filter(f=>f && f.type && f.type.startsWith('image/'));
  const preview = $('imagePreview'); preview.innerHTML=''; currentImageBase64s = [];
  if(!files.length) return;
  let readCount = 0;
  files.forEach((f,idx)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const data = reader.result;
      currentImageBase64s.push(data);
      const div = document.createElement('div'); div.className='thumb'; div.innerHTML = `<img src="${data}" alt="proof"><button class="remove-btn" data-idx="${idx}">✕</button>`;
      preview.appendChild(div);
      // remove handler
      div.querySelector('.remove-btn').addEventListener('click', function(){
        const i = Number(this.getAttribute('data-idx')); currentImageBase64s[i]=null; div.remove(); currentImageBase64s = currentImageBase64s.filter(x=>x);
      });
      readCount++;
      // normalize array to remove nulls
      if(readCount===files.length){ currentImageBase64s = currentImageBase64s.filter(x=>x); }
    };
    reader.readAsDataURL(f);
  });
}

function parseNum(v){
  if(v===null||v===undefined||v==='') return 0;
  const s = String(v).replace(/,/g,'').trim();
  const n = parseFloat(s);
  return isNaN(n)?0:n;
}

function formatMoney(n){
  const num = (n===null||n===undefined||n==='')?0: Number(n);
  return Number(num).toLocaleString('en-MY', {minimumFractionDigits:2, maximumFractionDigits:2});
}

// --- Existing Bookkeeping (legacy_bookkeeping) ---
// Manual legacy entry removed. saveLegacyEntry() intentionally removed to enforce CSV-only workflow.

function renderLegacy(){
  // filters
  const store = $('legacyStoreFilter')? $('legacyStoreFilter').value : 'ALL';
  const range = $('legacyRange')? $('legacyRange').value : 'all';
  const from = $('legacyFrom')? $('legacyFrom').value : '';
  const to = $('legacyTo')? $('legacyTo').value : '';
  const sort = $('legacySort')? $('legacySort').value : 'date_desc';

  let rows = loadSubmissions().filter(r=> r.recordType==='legacy_bookkeeping');

  // store filter
  if(store && store!=='ALL') rows = rows.filter(r=> r.store===store);

  if(range==='custom' && from && to) rows = rows.filter(r=> r.date>=from && r.date<=to);
  else if(range==='today'){ const d=getToday(); rows = rows.filter(r=> r.date===d); }
  else if(range==='this_week'){ const w=currentWeekRange(); rows = rows.filter(r=> r.date>=w[0] && r.date<=w[1]); }
  else if(range==='this_month'){ const m=currentMonthRange(); rows = rows.filter(r=> r.date>=m[0] && r.date<=m[1]); }
  else if(range==='this_year'){ const y=currentYearRange(); rows = rows.filter(r=> r.date>=y[0] && r.date<=y[1]); }
  legacySelectedIds = new Set([...legacySelectedIds].filter(id => rows.some(r=>r.id===id)));

  // sorting
  if(sort==='date_desc') rows.sort((a,b)=>b.date.localeCompare(a.date));
  else if(sort==='date_asc') rows.sort((a,b)=>a.date.localeCompare(b.date));
  else if(sort==='sales_desc') rows.sort((a,b)=> (b.total||0)-(a.total||0));
  else if(sort==='sales_asc') rows.sort((a,b)=> (a.total||0)-(b.total||0));

  // summary
  const totalSales = rows.reduce((s,i)=>s+(i.total||0),0);
  const totalCash = rows.reduce((s,i)=>s+(i.cash||0),0);
  const totalQR = rows.reduce((s,i)=>s+(i.qr||0),0);
  const totalCard = rows.reduce((s,i)=>s+(i.card||0),0);
  const count = rows.length;
  const sumEl = $('legacySummary'); if(sumEl) sumEl.innerHTML = `
    <div class="card" style="padding:10px;min-width:140px"><div class="overview-value">${formatMoney(totalSales)}</div><div class="overview-label">Total Sales</div></div>
    <div class="card" style="padding:10px;min-width:140px"><div class="overview-value">${formatMoney(totalCash)}</div><div class="overview-label">Total Cash</div></div>
    <div class="card" style="padding:10px;min-width:140px"><div class="overview-value">${formatMoney(totalQR)}</div><div class="overview-label">Total QR/Online</div></div>
    <div class="card" style="padding:10px;min-width:140px"><div class="overview-value">${formatMoney(totalCard)}</div><div class="overview-label">Total Credit Card</div></div>
    <div class="card" style="padding:10px;min-width:140px"><div class="overview-value">${count}</div><div class="overview-label">Records</div></div>
  `;

  const table = $('legacyTable'); const tableWrap = table ? table.closest('.table-wrap') : null; const summaryEl = $('legacySummary');
  const bulkBtn = $('legacyDeleteSelected'); const paginationEl = $('legacyPagination');
  const totalPages = Math.max(1, Math.ceil(rows.length / LEGACY_PAGE_SIZE));
  if(legacyPage > totalPages) legacyPage = totalPages;
  const startIndex = (legacyPage - 1) * LEGACY_PAGE_SIZE;
  const pageRows = rows.slice(startIndex, startIndex + LEGACY_PAGE_SIZE);

  // If there are no rows, hide the entire table wrapper and remove headers/body to avoid showing empty headers.
  if(!rows.length){
    if(tableWrap) tableWrap.style.display = 'none';
    if(table){ // remove thead/tbody so headers are not rendered
      const thead = table.querySelector('thead'); if(thead) thead.remove();
      const tbodyOld = table.querySelector('tbody'); if(tbodyOld) tbodyOld.remove();
    }
    if(summaryEl) summaryEl.innerHTML = `<div class="empty-state"><h3>No bookkeeping records yet.</h3></div>`;
    return;
  }

  // Ensure table wrapper visible and that the table has a thead and tbody to populate
  if(tableWrap) tableWrap.style.display = '';
  if(table){
    if(!table.querySelector('thead')){
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr>
                      <th><input id="legacy_select_all" type="checkbox" aria-label="Select all bookkeeping records"></th>
                      <th>Date</th>
                      <th>Store</th>
                      <th>Cash</th>
                      <th>QR/Online</th>
                      <th>Credit Card</th>
                      <th>Total Sales</th>
                      <th>Source</th>
                      <th>Remarks</th>
                      <th>Actions</th>
                    </tr>`;
      table.appendChild(thead);
    }
    if(!table.querySelector('tbody')){
      const newTbody = document.createElement('tbody'); newTbody.id = 'legacyTableBody'; table.appendChild(newTbody);
    }
  }

  const tbody = $('legacyTableBody'); if(!tbody) return; tbody.innerHTML='';
  pageRows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="legacy-row-checkbox" type="checkbox" value="${r.id}" ${legacySelectedIds.has(r.id)?'checked':''} onchange="toggleLegacyRowSelection(${r.id}, this.checked)"></td>
      <td>${formatDate(r.date)}</td>
      <td>${r.store||'-'}</td>
      <td>${formatMoney(r.cash||0)}</td>
      <td>${formatMoney(r.qr||0)}</td>
      <td>${formatMoney(r.card||0)}</td>
      <td>${formatMoney(r.total||0)}</td>
      <td>${r.source||'-'}</td>
      <td>${r.remarks? r.remarks : '-'}</td>
      <td class="actions-cell"><button class="action-btn" type="button" onclick="editLegacy(${r.id})">Edit</button> <button class="action-btn" type="button" onclick="deleteLegacy(${r.id})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  if(bulkBtn){
    bulkBtn.classList.toggle('hidden', legacySelectedIds.size===0);
    bulkBtn.disabled = legacySelectedIds.size===0;
    bulkBtn.textContent = `Delete Selected${legacySelectedIds.size? ` (${legacySelectedIds.size})` : ''}`;
  }

  if(paginationEl){
    paginationEl.innerHTML = '';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button'; prevBtn.className = 'secondary'; prevBtn.textContent = 'Previous';
    prevBtn.disabled = legacyPage === 1;
    prevBtn.addEventListener('click', ()=>{ legacyPage = Math.max(1, legacyPage - 1); renderLegacy(); });
    paginationEl.appendChild(prevBtn);

    for(let page = 1; page <= totalPages; page++){
      const pageBtn = document.createElement('button');
      pageBtn.type = 'button'; pageBtn.className = page === legacyPage ? 'primary' : 'secondary';
      pageBtn.textContent = String(page);
      pageBtn.disabled = page === legacyPage;
      pageBtn.addEventListener('click', ()=>{ legacyPage = page; renderLegacy(); });
      paginationEl.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button'; nextBtn.className = 'secondary'; nextBtn.textContent = 'Next';
    nextBtn.disabled = legacyPage === totalPages;
    nextBtn.addEventListener('click', ()=>{ legacyPage = Math.min(totalPages, legacyPage + 1); renderLegacy(); });
    paginationEl.appendChild(nextBtn);
  }

  const selectAllCheckbox = document.getElementById('legacy_select_all');
  if(selectAllCheckbox){
    selectAllCheckbox.checked = pageRows.length>0 && pageRows.every(r=>legacySelectedIds.has(r.id));
    selectAllCheckbox.onchange = function(){ toggleLegacySelectAll(this.checked); };
  }
}

function deleteLegacy(id){ if(!confirm('Delete this bookkeeping record?')) return; const subs = loadSubmissions(); const idx = subs.findIndex(s=>s.id==id); if(idx===-1) return; subs.splice(idx,1); legacySelectedIds.delete(id); saveSubmissions(subs); renderLegacy(); }

window.toggleLegacyRowSelection = function(id, checked){ if(checked) legacySelectedIds.add(id); else legacySelectedIds.delete(id); const selectAllCheckbox = document.getElementById('legacy_select_all'); if(selectAllCheckbox){ const tbody = $('legacyTableBody'); const pageBoxes = tbody ? Array.from(tbody.querySelectorAll('input.legacy-row-checkbox')) : []; selectAllCheckbox.checked = pageBoxes.length>0 && pageBoxes.every(cb=>cb.checked); } const bulkBtn = $('legacyDeleteSelected'); if(bulkBtn){ bulkBtn.classList.toggle('hidden', legacySelectedIds.size===0); bulkBtn.disabled = legacySelectedIds.size===0; bulkBtn.textContent = `Delete Selected${legacySelectedIds.size? ` (${legacySelectedIds.size})` : ''}`; } };

window.toggleLegacySelectAll = function(checked){ const tbody = $('legacyTableBody'); if(!tbody) return; const boxes = Array.from(tbody.querySelectorAll('input.legacy-row-checkbox')); boxes.forEach(cb=>{ cb.checked = checked; const id = Number(cb.value); if(checked) legacySelectedIds.add(id); else legacySelectedIds.delete(id); }); const bulkBtn = $('legacyDeleteSelected'); if(bulkBtn){ bulkBtn.classList.toggle('hidden', legacySelectedIds.size===0); bulkBtn.disabled = legacySelectedIds.size===0; bulkBtn.textContent = `Delete Selected${legacySelectedIds.size? ` (${legacySelectedIds.size})` : ''}`; } };

window.deleteSelectedLegacy = function(){ if(!legacySelectedIds.size) return; if(!confirm(`Delete ${legacySelectedIds.size} selected bookkeeping record(s)?`)) return; const subs = loadSubmissions().filter(s=> !(legacySelectedIds.has(s.id) && s.recordType==='legacy_bookkeeping')); saveSubmissions(subs); legacySelectedIds.clear(); legacyPage = 1; renderLegacy(); };

window.deleteLiveSubmission = function(id){
  if(!confirm('Delete this submission?')) return;
  const subs = loadSubmissions();
  const idx = subs.findIndex(s=>s.id==id && (s.recordType===undefined || s.recordType==='live_submission'));
  if(idx===-1) return alert('Record not found or not deletable.');
  subs.splice(idx,1);
  saveSubmissions(subs);
  // refresh dashboard immediately
  renderDashboard();
};

window.editLegacy = function(id){
  const subs = loadSubmissions(); const idx = subs.findIndex(s=>s.id==id);
  if(idx===-1) return alert('Bookkeeping record not found');
  const item = subs[idx];
  const body = $('editCardBody'); const footer = $('editCardFooter');
  body.innerHTML = `<h3>Edit Bookkeeping Record</h3>
    <form id="legacyEditForm">
      <label class="label">Date</label>
      <input id="legacy_edit_date" type="date" class="input" value="${item.date||''}">
      <label class="label">Store</label>
      <select id="legacy_edit_store" class="select">${STORES.map(s=>`<option value="${s}" ${s===item.store?'selected':''}>${s}</option>`).join('')}</select>
      <label class="label">Cash</label>
      <input id="legacy_edit_cash" type="number" min="0" step="0.01" class="input" value="${item.cash||0}">
      <label class="label">QR/Online</label>
      <input id="legacy_edit_qr" type="number" min="0" step="0.01" class="input" value="${item.qr||0}">
      <label class="label">Credit Card (CC)</label>
      <input id="legacy_edit_card" type="number" min="0" step="0.01" class="input" value="${item.card||0}">
      <label class="label">Total Sales</label>
      <input id="legacy_edit_total" type="number" min="0" step="0.01" class="input" value="${item.total||0}">
      <label class="label">Remarks</label>
      <textarea id="legacy_edit_remarks" class="textarea">${item.remarks||''}</textarea>
      <div id="legacy_edit_error" class="error hidden">Cash + QR/Online + Credit Card must equal Total Sales.</div>
    </form>`;
  footer.innerHTML = `<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="secondary" id="legacy_edit_cancel">Cancel</button><button type="button" class="primary" id="legacy_edit_save">Save</button></div>`;
  $('editModal').classList.add('show');

  document.getElementById('legacy_edit_cancel').addEventListener('click', closeEditModal);
  document.getElementById('legacy_edit_save').addEventListener('click', function(){ document.getElementById('legacyEditForm').requestSubmit(); });
  document.getElementById('legacyEditForm').addEventListener('submit', function(e){
    e.preventDefault();
    const date = $('legacy_edit_date').value;
    const store = $('legacy_edit_store').value;
    const cash = parseNum($('legacy_edit_cash').value);
    const qr = parseNum($('legacy_edit_qr').value);
    const card = parseNum($('legacy_edit_card').value);
    const total = parseNum($('legacy_edit_total').value);
    const remarks = $('legacy_edit_remarks').value || '';
    if(!date || !store || isNaN(cash) || isNaN(qr) || isNaN(card) || isNaN(total)){
      const err = $('legacy_edit_error'); err.textContent = 'Please fill all fields with valid values.'; err.classList.remove('hidden'); return;
    }
    if(Math.abs((cash + qr + card) - total) > 0.009){
      const err = $('legacy_edit_error'); err.textContent = 'Cash + QR/Online + Credit Card must equal Total Sales.'; err.classList.remove('hidden'); return;
    }
    subs[idx].date = date;
    subs[idx].store = store;
    subs[idx].cash = cash;
    subs[idx].qr = qr;
    subs[idx].card = card;
    subs[idx].total = total;
    subs[idx].remarks = remarks;
    saveSubmissions(subs);
    closeEditModal();
    renderLegacy();
  });
};

// --- CSV parsing & import for Sales History ---
function normalizeLegacyDate(s){ if(!s) return null; s = s.trim(); // accept YYYY-MM-DD or DD/MM/YYYY
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if(isoMatch) return s;
  const dm = /^\d{2}\/\d{2}\/\d{4}$/.test(s);
  if(dm){ const parts = s.split('/'); const dd = parts[0], mm = parts[1], yyyy = parts[2]; return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` }
  // try Date parse fallback
  const d = new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10); return null;
}

function isValidCSVNumber(v) {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return true;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s);
}

function handleLegacyCSVPreview(){
  const fileInput = $('legacyCsvFile'); const msg = $('legacyCsvMsg'); const preview = $('legacyCsvPreview'); const confirmBtn = $('legacyCsvConfirm');
  preview.innerHTML=''; preview._legacyParsed = null; msg.textContent=''; confirmBtn.disabled=true;
  if(!fileInput || !fileInput.files || !fileInput.files[0]){ msg.textContent='Choose a CSV file first.'; return }
  const f = fileInput.files[0]; const reader = new FileReader(); reader.onload = ()=>{
    try{
      const text = reader.result;
      const lines = text.split(/\r?\n/).filter(l=>l.trim());
      if(lines.length===0){ msg.textContent='No rows found in CSV.'; return }
      const rawHeaders = parseCSVLine(lines[0]).map(h=>String(h||'').trim());
      const requiredHeaders = ['Date','Store','Cash','QR','Card','Remarks'];
      const missing = requiredHeaders.filter(h=>!rawHeaders.includes(h));
      if(missing.length){
        msg.textContent = `Missing required column(s): ${missing.join(', ')}.`;
        confirmBtn.disabled = true;
        return;
      }
      const parsed = parseCSV(text);
      if(!parsed.length){ msg.textContent='No rows found in CSV.'; return }
      const allowedStores = STORES.slice();
      const valid = []; const invalid = [];
      parsed.forEach((row, idx)=>{
        const dateRaw = row['Date'];
        const store = String(row['Store']||'').trim();
        const cashRaw = row['Cash'];
        const qrRaw = row['QR'];
        const cardRaw = row['Card'];
        const remarks = String(row['Remarks']||'').trim();
        
        const reasons = [];
        const date = normalizeLegacyDate(dateRaw);
        if(!dateRaw || !date){
          reasons.push('Date is required (Format: YYYY-MM-DD or DD/MM/YYYY)');
        }
        
        if(!store){
          reasons.push('Store is required');
        } else if(!allowedStores.includes(store)){
          reasons.push(`Store must be one of: ${allowedStores.join(', ')}`);
        }
        
        if(!isValidCSVNumber(cashRaw)) reasons.push('Cash must be a number');
        if(!isValidCSVNumber(qrRaw)) reasons.push('QR must be a number');
        if(!isValidCSVNumber(cardRaw)) reasons.push('Card must be a number');
        
        if(reasons.length){
          invalid.push({row: idx+2, reasons, dateRaw, store, cashRaw, qrRaw, cardRaw, remarks});
        } else {
          const cash = parseNum(cashRaw);
          const qr = parseNum(qrRaw);
          const card = parseNum(cardRaw);
          const total = cash + qr + card;
          valid.push({date, store, cash, qr, card, total, remarks});
        }
      });
      
      let html = `<div class="import-preview-container" style="font-family:var(--font-sans); color:#1f2937;">`;
      html += `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:12px; border-radius:10px; text-align:center;">
            <div style="font-size:20px; font-weight:700; color:#16a34a;">${valid.length}</div>
            <div style="font-size:12px; color:#15803d; font-weight:500;">Ready to Import</div>
          </div>
          <div style="background:${invalid.length ? '#fef2f2' : '#f9fafb'}; border:1px solid ${invalid.length ? '#fecaca' : '#e5e7eb'}; padding:12px; border-radius:10px; text-align:center;">
            <div style="font-size:20px; font-weight:700; color:${invalid.length ? '#dc2626' : '#6b7280'};">${invalid.length}</div>
            <div style="font-size:12px; color:${invalid.length ? '#b91c1c' : '#6b7280'}; font-weight:500;">Invalid Rows</div>
          </div>
        </div>
      `;
      
      if(invalid.length){
        html += `
          <div style="background:#fff1f2; border-left:4px solid #f43f5e; padding:12px; border-radius:8px; margin-bottom:16px; font-size:13px; color:#9f1239;">
            <strong>Correction Required:</strong> There are validation errors in the CSV. Please resolve the errors below and upload the file again.
          </div>
        `;
      }
      
      if(valid.length){
        html += `
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#374151;">Preview (${valid.length} rows)</h4>
            <div style="max-height:160px; overflow:auto; border:1px solid #e5e7eb; border-radius:8px;">
              <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                <thead style="background:#f9fafb; position:sticky; top:0; box-shadow:0 1px 0 rgba(0,0,0,0.05); z-index:1;">
                  <tr>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb;">Date</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb;">Store</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb; text-align:right;">Cash</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb; text-align:right;">QR</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb; text-align:right;">Card</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb; text-align:right;">Total</th>
                    <th style="padding:8px 10px; font-weight:600; color:#4b5563; border-bottom:1px solid #e5e7eb;">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${valid.map(v => `
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:8px 10px; white-space:nowrap;">${formatDate(v.date)}</td>
                      <td style="padding:8px 10px; font-weight:500;">${v.store}</td>
                      <td style="padding:8px 10px; text-align:right;">${formatMoney(v.cash)}</td>
                      <td style="padding:8px 10px; text-align:right;">${formatMoney(v.qr)}</td>
                      <td style="padding:8px 10px; text-align:right;">${formatMoney(v.card)}</td>
                      <td style="padding:8px 10px; text-align:right; font-weight:600; color:#111827;">${formatMoney(v.total)}</td>
                      <td style="padding:8px 10px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#6b7280;" title="${v.remarks || ''}">${v.remarks || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
      
      if(invalid.length){
        html += `
          <div>
            <h4 style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#9f1239;">Validation Errors</h4>
            <div style="max-height:140px; overflow:auto; border:1px solid #fecaca; border-radius:8px;">
              <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                <thead style="background:#fff5f5; position:sticky; top:0; box-shadow:0 1px 0 rgba(0,0,0,0.05); z-index:1;">
                  <tr>
                    <th style="padding:8px 10px; font-weight:600; color:#991b1b; border-bottom:1px solid #fecaca; width:60px;">Row</th>
                    <th style="padding:8px 10px; font-weight:600; color:#991b1b; border-bottom:1px solid #fecaca;">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  ${invalid.map(iv => `
                    <tr style="border-bottom:1px solid #fef2f2; background:#fffdfd;">
                      <td style="padding:8px 10px; font-weight:600; color:#b91c1c;">#${iv.row}</td>
                      <td style="padding:8px 10px; color:#b91c1c; font-weight:400;">
                        <ul style="margin:0; padding-left:16px;">
                          ${iv.reasons.map(r => `<li>${r}</li>`).join('')}
                        </ul>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
      
      preview.innerHTML = html;
      preview._legacyParsed = { valid, invalid };
      confirmBtn.disabled = (valid.length === 0 || invalid.length > 0);
    }catch(err){ msg.textContent = 'Error parsing CSV. Please check the file format.'; preview.innerHTML = ''; confirmBtn.disabled = true; }
  };
  reader.readAsText(f);
}

function confirmLegacyCSVImport(){
  const preview = $('legacyCsvPreview'); if(!preview || !preview._legacyParsed) return; const parsed = preview._legacyParsed;
  if(!parsed.valid || !parsed.valid.length){ alert('No valid rows to import.'); return }
  const submissions = loadSubmissions(); let added=0;
  const importBatchId = Date.now() + Math.floor(Math.random()*1000);
  parsed.valid.forEach(v=>{
    const entry = {
      id: Date.now()+Math.floor(Math.random()*1000) + Math.floor(Math.random()*100),
      importBatchId,
      recordType:'legacy_bookkeeping',
      source:'CSV',
      date:v.date,
      store:v.store,
      cash:v.cash,
      qr:v.qr,
      card:v.card,
      total:v.total,
      remarks:v.remarks||'',
      status: 'Submitted',
      time: '00:00:00',
      submittedAt: Date.now(),
      history: []
    };
    submissions.push(entry); added++;
  });
  saveSubmissions(submissions);
  renderHistory();
  renderDashboard();
  updateSystemInfo();
  $('legacyCsvPreview').innerHTML='';
  $('legacyCsvMsg').textContent = `Imported ${added} row(s) successfully.`;
  $('legacyCsvConfirm').disabled = true;
  if($('legacyCsvFile')) $('legacyCsvFile').value='';
  preview._legacyParsed = null;
}

function exportSalesHistoryCSV(opts){
  const all = loadSubmissions();
  let rows = all.filter(r=> r.recordType===undefined || r.recordType==='live_submission' || r.recordType==='legacy_bookkeeping');
  
  if(!opts) opts = {};
  if(!opts.all){
    if(opts.startDate && opts.endDate){
      rows = rows.filter(r=> r.date >= opts.startDate && r.date <= opts.endDate);
    }
  }
  if(opts.store && opts.store!=='ALL') rows = rows.filter(r=> r.store===opts.store);

  rows.sort((a,b)=>a.date.localeCompare(b.date) || (a.submittedAt - b.submittedAt));

  const headers = ['Date','Store','Cash','QR','Card','Total','Remarks'];
  const lines = [headers.join(',')];
  rows.forEach(r=>{
    const vals = [
      r.date || '',
      r.store || '',
      (r.cash || 0).toFixed(2),
      (r.qr || 0).toFixed(2),
      (r.card || 0).toFixed(2),
      (r.total || 0).toFixed(2),
      r.remarks || ''
    ].map(escapeCSV);
    lines.push(vals.join(','));
  });
  
  const csv = lines.join('\n');
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const rangeLabel = opts.startDate && opts.endDate ? `${opts.startDate}_to_${opts.endDate}` : (opts.all? 'all_time' : getToday());
  const storeLabel = opts.store && opts.store!=='ALL' ? opts.store.replace(/\s+/g,'_') : 'all_stores';
  const name = `kul_sales_history_${rangeLabel}_${storeLabel}_${ts}.csv`;
  downloadCSV(name,csv);
}

// --- Settings: backup, reset, system info ---
function exportFullBackup(){
  const all = loadSubmissions();
  const payload = { exportedAt: Date.now(), records: all };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); const ts = new Date().toISOString().replace(/[:.]/g,'-'); const name = `kul_backup_${ts}.json`;
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  // store last backup time
  localStorage.setItem('kul_backup_last', String(Date.now())); updateSystemInfo();
}

function estimateLocalStorageUsage(){
  let total=0; for(let i=0;i<localStorage.length;i++){ const key=localStorage.key(i); const val=localStorage.getItem(key)||''; total += key.length + val.length; } // characters ~ bytes
  // return KB
  return Math.round((total/1024)*100)/100 + ' KB';
}

function updateSystemInfo(){
  const all = loadSubmissions();
  const live = all.filter(r=> r.recordType===undefined || r.recordType==='live_submission').length;
  const book = all.filter(r=> r.recordType==='legacy_bookkeeping').length;
  const b2b = all.filter(r=> r.store==='B2B').length;
  const storage = estimateLocalStorageUsage();
  const last = localStorage.getItem('kul_backup_last');
  $('sys_live').textContent = live;
  $('sys_book').textContent = book;
  $('sys_b2b').textContent = b2b;
  $('sys_storage').textContent = storage;
  $('sys_backup').textContent = last ? new Date(Number(last)).toLocaleString() : '-';
}

function performResetIfAuthorized(){
  const txt = $('resetConfirmText').value.trim(); const pass = $('resetAdminPass').value||'';
  if(txt!=='DELETE'){ alert('Type DELETE to confirm'); return }
  if(pass!==ADMIN_PASS){ alert('Invalid admin passcode'); return }
  // second confirmation prompt
  if(!confirm('Are you absolutely sure? This will erase all local app data.')) return;
  // perform reset: clear relevant keys (we'll clear STORAGE_KEY and backup timestamp)
  localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('kul_backup_last');
  $('resetModal').classList.remove('show');
  updateSystemInfo();
  alert('Local data has been reset.');
  // refresh views if open
  renderDashboard(); renderHistory(); renderB2B(); renderLegacy();
}

async function handleSubmit(e){
  e.preventDefault();
  const store = $('storeSelect').value;
  // require store selection
  if(!store){ const se = $('storeError'); if(se) se.classList.remove('hidden'); return; }
  else { const se = $('storeError'); if(se) se.classList.add('hidden'); }
  const madeSales = document.querySelector('input[name=madeSales]:checked').value;
  const submissions = loadSubmissions();
  const date = getToday();
  const time = timeNow();
  
  const submitBtn = $('submitBtn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Submitting...';
  submitBtn.disabled = true;

  let total=0, cash=0, qr=0, card=0, remarks='';
  let status = 'Submitted';
  let proofArr = [];
  let item;

  if(madeSales==='no'){
    remarks = $('noSalesRemarks').value||'';
    status = 'No Sales Today';
    item = {
      id:Date.now(),store,date,time,status,total:0,cash:0,qr:0,card:0,remarks,proofImages:[],history:[],submittedAt:Date.now()
    };
  } else {
    total = parseNum($('totalSales').value);
    cash = parseNum($('cashSales').value);
    qr = parseNum($('qrSales').value);
    card = parseNum($('cardSales').value);
    remarks = $('remarks').value||'';

    if(store!=='TikTok' && store!=='B2B'){
      if(Math.abs((cash+qr+card)-total) > 0.009){
        $('errorMsg').classList.remove('hidden');
        submitBtn.textContent = originalBtnText; submitBtn.disabled = false;
        return;
      } else $('errorMsg').classList.add('hidden');
    } else {
      $('errorMsg').classList.add('hidden');
    }

    const now = new Date();
    const late = now.getHours()>=23; // 11pm or after
    status = late? 'Late Submission' : 'Submitted';

    proofArr = (store==='TikTok') ? [] : currentImageBase64s.slice();
    item = { id:Date.now(), store, date, time, status, total, cash, qr, card, remarks, proofImages: proofArr, history:[], submittedAt:Date.now() };
    if(store==='B2B'){
      item.clientName = $('clientName').value||'';
      item.quotationNo = $('quotationNo').value||'';
      item.invoiceNo = $('invoiceNo').value||'';
    }
  }

  submissions.push(item); saveSubmissions(submissions);

  const gasUrl = 'https://script.google.com/macros/s/AKfycbzYTeDuYvf-DPc92dtPnhDMoUDX7LC64dOuW_Lu-q7O-9iYSTXD9UWwC7a3iu7zFUiK1w/exec';
  const payload = {
    date: date,
    store: store,
    cash: cash,
    qr: qr,
    card: card,
    remarks: remarks
  };

  let syncMsg = '';
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    // Apps script often returns success if fetch doesn't throw
    syncMsg = 'Sales submitted and synced to Google Sheet.';
  } catch (err) {
    // If CORS or network error happens
    syncMsg = 'Sales saved locally, but Google Sheet sync failed.';
  }

  console.log('Submitting sales...');
  submitBtn.textContent = originalBtnText; submitBtn.disabled = false;
  console.log(syncMsg.includes('synced') ? 'Google Sheet sync success' : 'Google Sheet sync failed');
  showSaved(item, syncMsg);
  // Refresh UI with live data
  console.log('Fetching latest live data...');
  (async () => {
    const liveData = await fetchLiveData();
    if (liveData && Array.isArray(liveData)) {
      console.log(`Live data received: ${liveData.length} records`);
      // Re-render dashboard with live data
      _renderDashboard(liveData);
    } else {
      console.warn('Live data fetch failed, using local data');
      const local = loadSubmissions();
      _renderDashboard(local);
    }
    // Also re-render history view
    if (typeof renderHistory === 'function') renderHistory();
    console.log('Dashboard re-rendered');
  })();
}

function showSaved(item, syncMsg){
  $('staffFormCard').classList.add('hidden');
  $('thankYouCard').hidden=false;
  let text = `${item.store} — ${item.time} (${item.status})`;
  if (syncMsg) {
    text += `\n\n${syncMsg}`;
  }
  $('savedText').innerText = text;
  // reset image
  currentImageBase64s = []; $('imageInput').value=''; $('imagePreview').innerHTML='';
  renderMissingHints();
}

function resetForm(){
  $('thankYouCard').hidden=true; $('staffFormCard').classList.remove('hidden');
  $('reportForm').reset(); $('imagePreview').innerHTML=''; $('b2bFields').classList.add('hidden'); $('salesFields').classList.remove('hidden');
}

function adminEnter(){
  const val = $('adminPass').value||'';
  if(val===ADMIN_PASS){
    $('adminModal').classList.remove('show'); $('adminPass').value=''; openAdmin();
  } else {
    $('adminErr').classList.remove('hidden'); setTimeout(()=>$('adminErr').classList.add('hidden'),2500);
  }
}

function openAdmin(){
  // Persist admin view state
  localStorage.setItem('currentView', 'admin');
  $('adminDashboard').hidden = false;
  $('staffFormCard').classList.add('hidden');
  // Fetch live data from Google Sheets then render dashboard and history
  (async () => {
    await renderDashboard();
    renderHistory();
  })();
}

function closeAdmin(){
  // Persist staff view state
  localStorage.setItem('currentView', 'staff');
  $('adminDashboard').hidden = true;
  $('staffFormCard').classList.remove('hidden');
  $('historyPanel').classList.add('hidden');
}

function renderMissingHints(){
  // placeholder if future
}

// Normalize a date value from Google Sheets to YYYY-MM-DD string.
// Sheets may serialize Date objects as full strings like "Wed Jun 10 2026 00:00:00 GMT+0800"
// or already return "2026-06-10". This handles both.
function normalizeSheetDate(val){
  if(!val) return '';
  const s = String(val).trim();
  // already ISO date
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try parsing as a date string
  try{
    const d = new Date(s);
    if(!isNaN(d.getTime())){
      // format in Malaysia timezone
      const tz = 'Asia/Kuala_Lumpur';
      const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
      const parts = fmt.formatToParts(d);
      const y = parts.find(p=>p.type==='year').value;
      const m = parts.find(p=>p.type==='month').value;
      const dd = parts.find(p=>p.type==='day').value;
      return `${y}-${m}-${dd}`;
    }
  }catch(e){}
  return s;
}

async function fetchLiveData(){
  const url = 'https://script.google.com/macros/s/AKfycbzYTeDuYvf-DPc92dtPnhDMoUDX7LC64dOuW_Lu-q7O-9iYSTXD9UWwC7a3iu7zFUiK1w/exec';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Network response was not ok');
    const data = await resp.json();
    if(Array.isArray(data)){
      // Normalize dates in every row
      data.forEach(row => {
        if(row['Date']) row['Date'] = normalizeSheetDate(row['Date']);
        if(row['date']) row['date'] = normalizeSheetDate(row['date']);
      });
      return data;
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch live data:', e);
    return null;
  }
}

// Helper to render dashboard given a submissions array (normalized objects with .date, .store, .total etc.)
function _renderDashboard(submissions){
  // Filter submissions for today's date (Malaysia timezone)
  const todayStr = getToday();
  const todaySubs = submissions.filter(s => s.date === todayStr && STORES.includes(s.store));

  // metrics based on today's submissions
  const totalSales = todaySubs.reduce((s,i)=>s+(i.total||0),0);
  const cashTotal = todaySubs.reduce((s,i)=>s+(i.cash||0),0);
  const qrTotal = todaySubs.reduce((s,i)=>s+(i.qr||0),0);
  const cardTotal = todaySubs.reduce((s,i)=>s+(i.card||0),0);
  const noSalesCount = todaySubs.filter(s=>s.status==='No Sales Today').length;
  const lateCount = todaySubs.filter(s=>s.status==='Late Submission').length;
  const storesToCheck = STORES.slice();
  const missingCount = storesToCheck.filter(st=>!todaySubs.find(s=>s.store===st)).length;
  const submittedStoresCount = STORES.filter(st=>todaySubs.find(s=>s.store===st)).length;
  const completionText = `${submittedStoresCount}/${STORES.length} Stores Submitted`;
  const overview = [
    {label:'Total Sales Today', value:formatMoney(totalSales)},
    {label:'Completion', value:completionText},
    {label:'Missing Submissions', value:missingCount},
    {label:'No Sales Stores', value:noSalesCount},
    {label:'Late Submissions', value:lateCount},
    {label:'Cash Total', value:formatMoney(cashTotal)},
    {label:'QR / Transfer Total', value:formatMoney(qrTotal)},
    {label:'Card Total', value:formatMoney(cardTotal)}
  ];
  const grid = $('overviewCards');
  grid.innerHTML = overview.map(o=>`<div class="card"><div class="overview-value">${o.value}</div><div class="overview-label">${o.label}</div></div>`).join('');

  // Store status table
  const tbody = $('statusTable').querySelector('tbody');
  tbody.innerHTML = '';
  const storesToDisplay = STORES.slice();
  storesToDisplay.forEach(store=>{
    const subsForStore = todaySubs.filter(s=>s.store===store).sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0));
    const latest = subsForStore[0];
    const tr = document.createElement('tr');
    const status = latest ? latest.status : 'Missing Submission';
    const total = latest ? formatMoney(latest.total||0) : '-';
    const dateCell = latest ? formatDate(latest.date) : '-';
    const time = latest ? (latest.time || '-') : '-';
    const proofCount = latest && Array.isArray(latest.proofImages) ? latest.proofImages.length : 0;
    let statusHtml = '';
    if(status==='Submitted') statusHtml = `<span class="status-badge status-submitted">Submitted</span>`;
    else if(status==='Missing Submission') statusHtml = `<span class="status-badge status-missing">Missing</span>`;
    else if(status==='No Sales Today') statusHtml = `<span class="status-badge status-nosales">No Sale</span>`;
    else if(status==='Late Submission') statusHtml = `<span class="status-badge status-late">Late</span>`;
    else statusHtml = `<span class="status-badge status-nosales">${status}</span>`;
    tr.innerHTML = `
      <td>${dateCell}</td>
      <td>${store}</td>
      <td>${statusHtml}</td>
      <td>${total}</td>
      <td>${time}</td>
      <td>${proofCount > 0 ? proofCount + ' image' + (proofCount > 1 ? 's' : '') : '-'}</td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

// Convert a raw Google Sheets row object into a normalized submission object
function sheetRowToSubmission(r){
  const store = String(r['Store'] || r['store'] || '').trim();
  const date = normalizeSheetDate(r['Date'] || r['date'] || '');
  const cash = parseFloat(r['Cash'] || r['cash']) || 0;
  const qr = parseFloat(r['QR'] || r['qr']) || 0;
  const card = parseFloat(r['Card'] || r['card']) || 0;
  const total = parseFloat(r['Total'] || r['total']) || (cash + qr + card);
  const remarks = String(r['Remarks'] || r['remarks'] || '').trim();
  // Determine status: if total > 0 it's Submitted; if total === 0 and row exists treat as No Sales Today
  const status = total > 0 ? 'Submitted' : 'No Sales Today';
  // Extract submitted time from 'Submitted At' column if available
  const submittedAtRaw = r['Submitted At'] || r['submittedAt'] || '';
  let submittedAt = 0;
  let time = '';
  if(submittedAtRaw){
    const d = new Date(submittedAtRaw);
    if(!isNaN(d.getTime())){
      submittedAt = d.getTime();
      time = d.toTimeString().slice(0,8);
    }
  }
  return { store, date, cash, qr, card, total, remarks, status, time, submittedAt, proofImages: [], _fromSheet: true };
}

async function renderDashboard(){
  // Attempt to load live data from Google Sheets first
  const liveData = await fetchLiveData();
  let submissions = [];
  const statusEl = document.getElementById('liveStatus');
  if (liveData && Array.isArray(liveData)) {
    // Cache live data globally so other views (Sales History) can use it
    _liveDataCache = liveData.map(sheetRowToSubmission);
    submissions = _liveDataCache;
    if (statusEl) {
      statusEl.textContent = '✓ Live data synced';
      statusEl.style.background = '#d1fae5';
      statusEl.style.color = '#065f46';
      statusEl.classList.remove('hidden');
    }
  } else {
    // Silent fallback to localStorage — no alert
    console.warn('Live data unavailable — showing local backup');
    if (statusEl) {
      statusEl.textContent = '⚠ Offline — local data';
      statusEl.style.background = '#fef3c7';
      statusEl.style.color = '#92400e';
      statusEl.classList.remove('hidden');
    }
    submissions = loadSubmissions();
  }
  _renderDashboard(submissions);
}

function renderDetailedDashboard() {
  // Only include the core 3 stores
  const allToday = loadSubmissions().filter(s=>s.date===getToday() && STORES.includes(s.store));
  const storeFilter = $('exportStore')? $('exportStore').value : 'ALL';
  const submissions = (storeFilter && storeFilter!=='ALL') ? allToday.filter(s=>s.store===storeFilter) : allToday;
  // metrics (based on filtered submissions)
  const totalSales = submissions.reduce((s,i)=>s+(i.total||0),0);
  const cashTotal = submissions.reduce((s,i)=>s+(i.cash||0),0);
  const qrTotal = submissions.reduce((s,i)=>s+(i.qr||0),0);
  const cardTotal = submissions.reduce((s,i)=>s+(i.card||0),0);
  const noSalesCount = submissions.filter(s=>s.status==='No Sales Today').length;
  const lateCount = submissions.filter(s=>s.status==='Late Submission').length;
  // missing submissions should consider selected stores only
  const storesToCheck = (storeFilter && storeFilter!=='ALL') ? [storeFilter] : STORES.slice();
  const missingCount = storesToCheck.filter(st=>!allToday.find(s=>s.store===st)).length;

  // Recalculate completion
  const submittedStoresCount = STORES.filter(st=>allToday.find(s=>s.store===st)).length;
  const completionText = `${submittedStoresCount}/${STORES.length} Stores Submitted`;

  const overview = [
    {label:'Total Sales Today', value:formatMoney(totalSales)},
    {label:'Completion', value:completionText},
    {label:'Missing Submissions', value:missingCount},
    {label:'No Sales Stores', value:noSalesCount},
    {label:'Late Submissions', value:lateCount},
    {label:'Cash Total', value:formatMoney(cashTotal)},
    {label:'QR / Transfer Total', value:formatMoney(qrTotal)},
    {label:'Card Total', value:formatMoney(cardTotal)}
  ];

  const grid = $('overviewCards'); grid.innerHTML = overview.map(o=>`<div class="card"><div class="overview-value">${o.value}</div><div class="overview-label">${o.label}</div></div>`).join('');

  // table
  const tbody = $('statusTable').querySelector('tbody'); tbody.innerHTML='';
  const storesToDisplay = (storeFilter && storeFilter!=='ALL') ? [storeFilter] : STORES.slice();
  storesToDisplay.forEach(store=>{
    const subsForStore = allToday.filter(s=>s.store===store).sort((a,b)=>b.submittedAt-a.submittedAt);
    const latest = subsForStore[0];
    const tr = document.createElement('tr');
    const status = latest? latest.status : 'Missing Submission';
    const total = latest? formatMoney(latest.total||0) : '-';
    const dateCell = latest? formatDate(latest.date) : '-';
    const time = latest? latest.time : '-';
    const proofCount = latest && Array.isArray(latest.proofImages) ? latest.proofImages.length : 0;
    // status badge mapping
    let statusHtml = '';
    if(status==='Submitted') statusHtml = `<span class="status-badge status-submitted">Submitted</span>`;
    else if(status==='Missing Submission') statusHtml = `<span class="status-badge status-missing">Missing</span>`;
    else if(status==='No Sales Today') statusHtml = `<span class="status-badge status-nosales">No Sales</span>`;
    else if(status==='Late Submission') statusHtml = `<span class="status-badge status-late">Late</span>`;
    else statusHtml = `<span class="status-badge status-nosales">${status}</span>`;
    // Customize cells for TikTok and B2B
    let storeCell = store;
    let proofCell = '';
    if(store==='TikTok'){
      // TikTok: single amount entry only; hide proof
      storeCell = store;
      proofCell = `<span class="proof-label">-</span>`;
    } else if(store==='B2B'){
      // B2B: show client under store, show quotation/invoice in proof cell
      const client = latest && latest.clientName ? latest.clientName : '';
      const quot = latest && latest.quotationNo ? latest.quotationNo : '-';
      const inv = latest && latest.invoiceNo ? latest.invoiceNo : '-';
      storeCell = `${store}${client?`<div style="font-size:13px;color:var(--muted);margin-top:4px">${client}</div>`:''}`;
      proofCell = `<div style="font-size:13px;color:var(--muted)">Q: ${quot} • Inv: ${inv}</div>`;
    } else {
      // default stores: show small preview + count
      const tinyPreview = (proofCount>0 && latest.proofImages[0]) ? `<img src="${latest.proofImages[0]}" class="img-thumb tiny" alt="proof" onclick="window.open('${latest.proofImages[0]}','_blank')" style="margin-right:8px">` : '';
      const proofLabel = proofCount>0 ? `<span class="proof-label">${proofCount} image${proofCount>1?'s':''}</span>` : `<span class="proof-label">No Proof</span>`;
      proofCell = `${tinyPreview}${proofLabel}`;
    }

    tr.innerHTML = `
      <td>${dateCell}</td>
      <td>${storeCell}</td>
      <td>${statusHtml}</td>
      <td>${total}</td>
      <td>${time}</td>
      <td>${proofCell}</td>
      <td class="actions-cell"><button class="action-btn" data-store="${store}" onclick="viewSubmission('${store}')">View</button>
        ${latest? `<button class="action-btn" onclick="editSubmission(${latest.id})">Edit</button>` : ''}
        ${latest? `<button class="action-btn" onclick="deleteRecord(${latest.id})">Delete</button>` : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function switchAdminTab(tab){
  const map = {
    dashboard: 'tabDashboard',
    history: 'tabHistory',
    b2b: 'tabB2B',
    existing: 'tabExisting',
    settings: 'tabSettings'
  };
  Object.keys(map).forEach(key=>{
    const btn = $(map[key]);
    if(btn) btn.setAttribute('aria-selected', key===tab?'true':'false');
    if(btn) btn.classList.toggle('active', key===tab);
  });
  // views
  const views = ['dashboardView','historyView','b2bView','existingView','settingsView'];
  views.forEach(v=>{ const el = $(v); if(el) el.classList.toggle('hidden', v!==(tab+'View')); });
  if(tab==='dashboard') renderDashboard();
  if(tab==='history') renderHistory();
  // other tabs are simple placeholders per step 1; no data logic moved here
  if(tab==='b2b') renderB2B();
}

// --- Sales History logic ---
function getFilterRangeFromYearMonth(year, month){
  if(!year || year==='ALL') return null;
  const y = Number(year);
  if(month && month!=='ALL'){
    const m = Number(month)-1;
    const start = new Date(y,m,1); const end = new Date(y,m+1,0);
    return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
  } else {
    const start = new Date(y,0,1); const end = new Date(y,11,31);
    return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
  }
}

function renderHistory(){
  // read filters
  const store = $('histStore').value || 'ALL';
  const range = $('histRange').value || 'all';
  const from = $('histFrom').value; const to = $('histTo').value;

  // Merge live Google Sheet data (if cached) with localStorage records.
  // Sheet data is the source of truth for retail sales; localStorage keeps
  // any records not yet in the Sheet (e.g. just submitted and not yet fetched).
  let rows = [];
  if(_liveDataCache && _liveDataCache.length){
    // Use Sheet data as primary source
    rows = _liveDataCache.slice();
    // Append localStorage-only records that aren't already represented
    const localSubs = loadSubmissions().filter(r => r.recordType===undefined || r.recordType==='live_submission' || r.recordType==='legacy_bookkeeping');
    localSubs.forEach(ls => {
      // A local record not in cache (e.g. freshly submitted before next fetch) — include it
      const alreadyInSheet = rows.some(sr => sr.store === ls.store && sr.date === ls.date && Math.abs((sr.total||0)-(ls.total||0)) < 0.01);
      if(!alreadyInSheet) rows.push(ls);
    });
  } else {
    // No live cache — fall back entirely to localStorage
    rows = loadSubmissions().filter(r=> r.recordType===undefined || r.recordType==='live_submission' || r.recordType==='legacy_bookkeeping');
  }

  // apply store filter
  if(store && store!=='ALL') rows = rows.filter(r=>r.store===store);

  if(range==='custom' && from && to){ rows = rows.filter(r=> r.date>=from && r.date<=to); }
  else if(range==='today'){ const d = getToday(); rows = rows.filter(r=> r.date===d); }
  else if(range==='this_week'){ const w=currentWeekRange(); rows = rows.filter(r=> r.date>=w[0] && r.date<=w[1]); }
  else if(range==='this_month'){ const m=currentMonthRange(); rows = rows.filter(r=> r.date>=m[0] && r.date<=m[1]); }
  else if(range==='this_year'){ const y=currentYearRange(); rows = rows.filter(r=> r.date>=y[0] && r.date<=y[1]); }

  // summary cards
  const totalSales = rows.reduce((s,i)=>s+(i.total||0),0);
  const count = rows.length;
  const summary = $('historySummary'); summary.innerHTML = `
    <div class="card" style="padding:12px;min-width:160px"><div class="overview-value">${formatMoney(totalSales)}</div><div class="overview-label">Total Sales</div></div>
    <div class="card" style="padding:12px;min-width:160px"><div class="overview-value">${count}</div><div class="overview-label">Records</div></div>
  `;

  // table
  const tbody = $('historyTableBody'); tbody.innerHTML='';
  if(!rows.length){ 
    tbody.innerHTML = `<tr><td colspan="5" style="padding:12px;color:var(--muted)">No records found for selected filters.</td></tr>`; 
    if ($('viewAllHistoryBtn')) $('viewAllHistoryBtn').style.display = 'none';
    if ($('viewLessHistoryBtn')) $('viewLessHistoryBtn').style.display = 'none';
    return; 
  }
  
  rows.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || ((b.submittedAt||0) - (a.submittedAt||0)));
  
  const displayRows = historyShowAll ? rows : rows.slice(0, 5);
  
  displayRows.forEach(r=>{
    const tr = document.createElement('tr');
    const totalStr = `RM ${formatMoney(r.total||0)}`;
    let statusRemark = r.remarks || '-';
    if ((r.total || 0) === 0) {
      statusRemark = `<span class="status-badge status-nosales" style="margin:0;display:inline-block">No Sale</span>`;
    }
    // Sheet rows have no local id — omit Edit/Delete buttons for them
    const hasLocalId = !!r.id && !r._fromSheet;
    tr.innerHTML = `
      <td>${formatDate(r.date)}</td>
      <td>${r.store||'-'}</td>
      <td style="font-weight:600">${totalStr}</td>
      <td>${statusRemark}</td>
      <td class="actions-cell">
        ${r.id && !r._fromSheet ? `<button class="action-btn" onclick="viewRecord(${r.id})">View</button>` : ''}
        ${hasLocalId ? ` <button class="action-btn" onclick="editSubmission(${r.id})">Edit</button>` : ''}
        ${hasLocalId ? ` <button class="action-btn" onclick="deleteRecord(${r.id})">Delete</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if ($('viewAllHistoryBtn') && $('viewLessHistoryBtn')) {
    if (rows.length > 5) {
      if (historyShowAll) {
        $('viewAllHistoryBtn').style.display = 'none';
        $('viewLessHistoryBtn').style.display = 'inline-block';
      } else {
        $('viewAllHistoryBtn').style.display = 'inline-block';
        $('viewLessHistoryBtn').style.display = 'none';
      }
    } else {
      $('viewAllHistoryBtn').style.display = 'none';
      $('viewLessHistoryBtn').style.display = 'none';
    }
  }
}

function viewRecord(id){
  const subs = loadSubmissions(); const rec = subs.find(s=>s.id==id); if(!rec) return alert('Record not found');
  const body = $('editCardBody'); const footer = $('editCardFooter');
  let html = `<h3>${rec.store} — ${rec.status||''}</h3>`;
  html += `<p><strong>Date:</strong> ${formatDate(rec.date)}</p>`;
  html += `<p><strong>Time:</strong> ${rec.time||''}</p>`;
  html += `<p><strong>Total:</strong> RM ${formatMoney(rec.total||0)}</p>`;
  if(rec.store !== 'TikTok' && rec.store !== 'B2B') {
    html += `<p><strong>Cash:</strong> RM ${formatMoney(rec.cash||0)}</p>`;
    html += `<p><strong>QR/Online:</strong> RM ${formatMoney(rec.qr||0)}</p>`;
    html += `<p><strong>Card:</strong> RM ${formatMoney(rec.card||0)}</p>`;
  }
  if(rec.clientName) html += `<p><strong>Client:</strong> ${rec.clientName}</p>`;
  if(rec.remarks) html += `<p><strong>Remarks:</strong> ${rec.remarks}</p>`;
  if(Array.isArray(rec.proofImages) && rec.proofImages.length){ html += `<div class="proof-count">${rec.proofImages.length} image${rec.proofImages.length>1?'s':''}</div><div class="gallery-container">`; rec.proofImages.forEach((p,i)=> html += `<div class="gallery-item"><img src="${p}" alt="p${i}" onclick="window.open('${p}','_blank')"></div>`); html += `</div>` }
  body.innerHTML = html; footer.innerHTML = `<div style="display:flex;justify-content:flex-end"><button class="secondary" onclick="closeEditModal()">Close</button></div>`;
  $('editModal').classList.add('show');
}

// --- B2B Records logic ---
function renderB2B(){
  const range = $('b2bRange')? $('b2bRange').value : 'all';
  const from = $('b2bFrom')? $('b2bFrom').value : '';
  const to = $('b2bTo')? $('b2bTo').value : '';
  const search = $('b2bSearch')? $('b2bSearch').value.trim().toLowerCase() : '';

  // start with B2B submissions only
  let rows = loadSubmissions().filter(r=> r.store==='B2B');

  if(range==='custom' && from && to){ rows = rows.filter(r=> r.date>=from && r.date<=to); }
  else if(range==='today'){ const d = getToday(); rows = rows.filter(r=> r.date===d); }
  else if(range==='this_week'){ const w = currentWeekRange(); rows = rows.filter(r=> r.date>=w[0] && r.date<=w[1]); }
  else if(range==='this_month'){ const m = currentMonthRange(); rows = rows.filter(r=> r.date>=m[0] && r.date<=m[1]); }
  else if(range==='this_year'){ const y=currentYearRange(); rows = rows.filter(r=> r.date>=y[0] && r.date<=y[1]); }

  // search across clientName, quotationNo, invoiceNo
  if(search){ rows = rows.filter(r=>{
    const client = (r.clientName||'').toLowerCase(); const quot = (r.quotationNo||'').toLowerCase(); const inv = (r.invoiceNo||'').toLowerCase();
    return client.includes(search) || quot.includes(search) || inv.includes(search);
  }) }

  // summary
  const total = rows.reduce((s,i)=>s+(i.total||0),0);
  const count = rows.length;
  const summary = $('b2bSummary'); summary.innerHTML = `
    <div class="card" style="padding:12px;min-width:160px"><div class="overview-value">${formatMoney(total)}</div><div class="overview-label">Total B2B Amount</div></div>
    <div class="card" style="padding:12px;min-width:160px"><div class="overview-value">${count}</div><div class="overview-label">B2B Records</div></div>
  `;

  // table
  const tbody = $('b2bTableBody'); tbody.innerHTML='';
  if(!rows.length){ tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:var(--muted)">No B2B records found.</td></tr>`; return }
  rows.sort((a,b)=>b.submittedAt - a.submittedAt).forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(r.date)}</td>
      <td>${r.clientName||'-'}</td>
      <td>${r.quotationNo||'-'}</td>
      <td>${r.invoiceNo||'-'}</td>
      <td>${formatMoney(r.total||0)}</td>
      <td>${r.time||'-'}</td>
      <td class="actions-cell"><button class="action-btn" onclick="viewRecord(${r.id})">View</button> <button class="action-btn" onclick="editSubmission(${r.id})">Edit</button></td>
    `;
    tbody.appendChild(tr);
  });
}


/* CSV Export / Import */
function escapeCSV(val){
  if(val===null||val===undefined) return '';
  const s = (typeof val==='object')? JSON.stringify(val) : String(val);
  if(s.includes(',')||s.includes('"')||s.includes('\n')){
    return `"${s.replace(/"/g,'""')}"`;
  }
  return s;
}

function toCSV(rows){
  const headers = ['id','store','date','time','status','total','cash','qr','card','remarks','proofCount','proofImages','clientName','quotationNo','invoiceNo','submittedAt','history'];
  const lines = [headers.join(',')];
  rows.forEach(r=>{
    const vals = headers.map(h=>{
      let v = r[h];
      if(h==='history') v = v? JSON.stringify(v) : '';
      if(h==='proofImages') v = v? JSON.stringify(v) : '';
      if(h==='proofCount') v = Array.isArray(r.proofImages)? r.proofImages.length : (r.proofImages?1:0);
      if(['total','cash','qr','card'].includes(h)){
        v = (r[h]!==undefined && r[h]!==null)? formatMoney(r[h]) : '';
      }
      return escapeCSV(v);
    });
    lines.push(vals.join(','));
  });
  return lines.join('\n');
}

function downloadCSV(filename, csv){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportCSV(opts){
  const all = loadSubmissions();
  let rows = all;
  if(!opts) opts = {};
  if(!opts.all){
    if(opts.startDate && opts.endDate){
      rows = rows.filter(r=> r.date >= opts.startDate && r.date <= opts.endDate);
    } else if(opts.date){
      rows = rows.filter(r=> r.date===opts.date);
    }
  }
  if(opts.store && opts.store!=='ALL') rows = rows.filter(r=> r.store===opts.store);

  const csv = toCSV(rows);
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const rangeLabel = opts.startDate && opts.endDate ? `${opts.startDate}_to_${opts.endDate}` : (opts.all? 'all_time' : getToday());
  const storeLabel = opts.store && opts.store!=='ALL' ? opts.store.replace(/\s+/g,'_') : 'all_stores';
  const name = `kul_reports_${rangeLabel}_${storeLabel}_${ts}.csv`;
  downloadCSV(name,csv);
}

function currentWeekRange(){
  const now = new Date();
  const day = now.getDay(); // 0 Sun..6 Sat
  const diffToMonday = (day + 6) % 7; // Mon=0
  const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return [monday.toISOString().slice(0,10), sunday.toISOString().slice(0,10)];
}

function currentMonthRange(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth()+1, 0);
  return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
}

function currentYearRange(){
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
}

function parseCSV(text){
  const rows = [];
  const lines = text.split(/\r?\n/);
  if(lines.length===0) return rows;
  const headers = parseCSVLine(lines[0]).map(h=>String(h||'').trim());
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++) obj[headers[j]] = fields[j]===undefined? '': String(fields[j]).trim();
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line){
  const res=[];
  let cur=''; let inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQuotes){
      if(ch==="\""){
        if(line[i+1]==="\""){cur+='"'; i++;} else {inQuotes=false}
      } else cur+=ch;
    } else {
      if(ch==="\""){inQuotes=true;} else if(ch===','){res.push(cur); cur='';} else cur+=ch;
    }
  }
  res.push(cur);
  return res;
}

function importCSV(){
  const fileInput = $('importFile');
  const f = fileInput.files[0];
  const msg = $('importMsg'); msg.textContent='';
  if(!f){ msg.textContent='Choose a CSV file first.'; return }
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = parseCSV(reader.result);
      if(!parsed.length){ msg.textContent='No rows found in CSV.'; return }
      const submissions = loadSubmissions();
      let added=0, skipped=0, updated=0;
      parsed.forEach(row=>{
        // basic validation
        if(!row.store || !row.date) { skipped++; return }
        // reconstruct object
        const obj = {
          id: row.id? Number(row.id) : Date.now()+Math.floor(Math.random()*1000),
          store: row.store,
          date: row.date,
          time: row.time||'00:00:00',
          status: row.status||'Submitted',
          total: parseNum(row.total||0), cash: parseNum(row.cash||0), qr: parseNum(row.qr||0), card: parseNum(row.card||0),
          remarks: row.remarks||'',
          clientName: row.clientName||'', quotationNo: row.quotationNo||'', invoiceNo: row.invoiceNo||'',
          submittedAt: row.submittedAt? Number(row.submittedAt): Date.now(), history: []
        };
        // handle proofImages field (CSV may contain JSON array) or legacy image field
        if(row.proofImages){ try{ obj.proofImages = JSON.parse(row.proofImages); }catch(e){ obj.proofImages = [] }} else if(row.image){ obj.proofImages = [row.image]; } else { obj.proofImages = [] }
        if(row.history){ try{ obj.history = JSON.parse(row.history); }catch(e){ obj.history = [] }}
        const exists = submissions.findIndex(s=>String(s.id)===String(obj.id));
        if(exists>-1){ skipped++; } else { submissions.push(obj); added++; }
      });
      saveSubmissions(submissions);
      msg.textContent = `Imported. Added: ${added}. Skipped: ${skipped}.`;
      renderDashboard();
    }catch(err){ msg.textContent = 'Error parsing CSV'; }
  };
  reader.readAsText(f);
}

window.viewSubmission = function(store){
  const subs = loadSubmissions().filter(s=>s.store===store && s.date===getToday()).sort((a,b)=>b.submittedAt-a.submittedAt);
  const latest = subs[0];
  const card = $('editCard');
  const body = $('editCardBody');
  const footer = $('editCardFooter');
  if(!latest){
    body.innerHTML = `<h3>${store}</h3><p>No submission for today.</p>`;
    footer.innerHTML = `<div style="display:flex;justify-content:flex-end"><button class="primary" onclick="closeEditModal()">Close</button></div>`;
    $('editModal').classList.add('show');
    return;
  }
  // Custom view per store type
  let html = `<h3>${store} — ${latest.status}</h3>`;
  if(store==='TikTok'){
    // TikTok: minimal view
    html += `<p><strong>Total Sales:</strong> ${formatMoney(latest.total)}</p>`;
    if(latest.remarks) html += `<p><strong>Remarks:</strong> ${latest.remarks}</p>`;
    html += `<p><strong>Submitted:</strong> ${latest.time}</p>`;
  } else if(store==='B2B'){
    // B2B: show client and invoice details and proof images
    html += `<p><strong>Total Amount:</strong> ${formatMoney(latest.total)}</p>`;
    if(latest.clientName) html += `<p><strong>Client / Company:</strong> ${latest.clientName}</p>`;
    if(latest.quotationNo) html += `<p><strong>Quotation #:</strong> ${latest.quotationNo}</p>`;
    if(latest.invoiceNo) html += `<p><strong>Invoice #:</strong> ${latest.invoiceNo}</p>`;
    if(latest.remarks) html += `<p><strong>Remarks:</strong> ${latest.remarks}</p>`;
    if(Array.isArray(latest.proofImages) && latest.proofImages.length){
      html += `<div class="proof-count">${latest.proofImages.length} image${latest.proofImages.length>1?'s':''}</div>`;
      html += `<div class="gallery-container">`;
      latest.proofImages.forEach((p, i)=>{ html += `<div class="gallery-item"><img src="${p}" alt="proof-${i}" onclick="window.open('${p}','_blank')"></div>` });
      html += `</div>`;
    }
    if(latest.history && latest.history.length){
      html += `<h4>Edit History</h4>`;
      latest.history.forEach(h=>{
        html += `<div class="history-item"><div><strong>Edited At:</strong> ${new Date(h.editedAt).toLocaleString()}</div><div><strong>By:</strong> ${h.editedBy}</div><div><strong>Original total:</strong> ${formatMoney(h.original.total)}</div><div><strong>Edited total:</strong> ${formatMoney(h.edited.total)}</div></div>`;
      })
    }
    html += `<p><strong>Submitted:</strong> ${latest.time}</p>`;
  } else {
    // Default view: full breakdown
    html += `<p><strong>Total:</strong> ${formatMoney(latest.total)}</p>`;
    html += `<p><strong>Cash:</strong> ${formatMoney(latest.cash)}</p><p><strong>QR:</strong> ${formatMoney(latest.qr)}</p><p><strong>Card:</strong> ${formatMoney(latest.card)}</p>`;
    if(latest.clientName) html += `<p><strong>Client:</strong> ${latest.clientName}</p>`;
    if(latest.quotationNo) html += `<p><strong>Quotation:</strong> ${latest.quotationNo}</p>`;
    if(latest.invoiceNo) html += `<p><strong>Invoice:</strong> ${latest.invoiceNo}</p>`;
    if(latest.remarks) html += `<p><strong>Remarks:</strong> ${latest.remarks}</p>`;
    if(Array.isArray(latest.proofImages) && latest.proofImages.length){
      html += `<div class="proof-count">${latest.proofImages.length} image${latest.proofImages.length>1?'s':''}</div>`;
      html += `<div class="gallery-container">`;
      latest.proofImages.forEach((p, i)=>{ html += `<div class="gallery-item"><img src="${p}" alt="proof-${i}" onclick="window.open('${p}','_blank')"></div>` });
      html += `</div>`;
    }
    if(latest.history && latest.history.length){
      html += `<h4>Edit History</h4>`;
      latest.history.forEach(h=>{
        html += `<div class="history-item"><div><strong>Edited At:</strong> ${new Date(h.editedAt).toLocaleString()}</div><div><strong>By:</strong> ${h.editedBy}</div><div><strong>Original total:</strong> ${formatMoney(h.original.total)}</div><div><strong>Edited total:</strong> ${formatMoney(h.edited.total)}</div></div>`;
      })
    }
    html += `<p><strong>Submitted:</strong> ${latest.time}</p>`;
  }
  body.innerHTML = html;
  footer.innerHTML = `<div style="display:flex;gap:8px;justify-content:flex-end"><button class="secondary" onclick="closeEditModal()">Close</button><button class="primary" onclick="editSubmission(${latest.id})">Edit</button></div>`;
  card._newImage = null;
  $('editModal').classList.add('show');
}

window.closeEditModal = function(){ 
  const card = $('editCard');
  $('editModal').classList.remove('show');
  $('editCardBody').innerHTML=''; $('editCardFooter').innerHTML='';
  if(card){ card._newImage = null; card._newImages = null; card._existingImages = null; card._removed = null; }
}

window.editSubmission = function(id){
  const subs = loadSubmissions();
  const idx = subs.findIndex(s=>s.id==id); if(idx===-1) return alert('Submission not found');
  const item = subs[idx];
  const card = $('editCard');
  const body = $('editCardBody');
  const footer = $('editCardFooter');
  let html = `<h3>Edit ${item.store}</h3>`;
  html += `<form id="adminEditForm">
    <label class="label">Date</label><input type="date" class="input" id="e_date" value="${item.date||''}">
    <label class="label">Total</label><input class="input" id="e_total" value="${item.total||0}">
    <div id="e_breakdown_fields">
      <label class="label">Cash</label><input class="input" id="e_cash" value="${item.cash||0}">
      <label class="label">QR</label><input class="input" id="e_qr" value="${item.qr||0}">
      <label class="label">Card</label><input class="input" id="e_card" value="${item.card||0}">
    </div>
    <label class="label">Remarks</label><textarea class="textarea" id="e_remarks">${item.remarks||''}</textarea>
    ${(item.store==='B2B')?`<label class="label">Client</label><input class="input" id="e_client" value="${item.clientName||''}"><label class="label">Quotation</label><input class="input" id="e_quot" value="${item.quotationNo||''}"><label class="label">Invoice</label><input class="input" id="e_inv" value="${item.invoiceNo||''}">`:''}
    <div class="label">Proof images</div>
    <div id="e_existing" class="image-thumbs"></div>
    <div class="label" style="margin-top:8px">Add / Replace proof images</div>
    <input type="file" id="e_image" accept="image/*" multiple>
    <div id="e_imagePreview" class="image-thumbs"></div>
    <div id="e_err" class="error hidden">Breakdown does not match total sales.</div>
  </form>`;
  body.innerHTML = html;
  footer.innerHTML = `<div style="display:flex;gap:8px;justify-content:flex-end;background:transparent;padding-top:8px"><button type="button" class="secondary" id="e_cancel">Cancel</button> <button type="button" class="primary" id="e_save">Save</button></div>`;
  // prepare arrays for existing and new images
  card._existingImages = Array.isArray(item.proofImages)? item.proofImages.slice() : [];
  card._newImages = [];
  card._removed = [];
  $('editModal').classList.add('show');

  const eBreakdown = document.getElementById('e_breakdown_fields');
  if(item.store === 'TikTok' || item.store === 'B2B'){
    if(eBreakdown) eBreakdown.classList.add('hidden');
  }

  // render existing images with remove buttons
  const existingWrap = document.getElementById('e_existing'); existingWrap.innerHTML='';
  card._existingImages.forEach((p, i)=>{ if(!p) return; const d = document.createElement('div'); d.className='thumb'; d.innerHTML = `<img src="${p}" alt="ex-${i}"><button class="remove-btn" data-idx="${i}">✕</button>`; existingWrap.appendChild(d); d.querySelector('.remove-btn').addEventListener('click', function(){ const idx = Number(this.getAttribute('data-idx')); card._existingImages[idx]=null; d.remove(); card._existingImages = card._existingImages.filter(x=>x); }); });

  document.getElementById('e_image').addEventListener('change', function(ev){
    const files = Array.from(ev.target.files || []).filter(f=>f && f.type && f.type.startsWith('image/'));
    const preview = $('e_imagePreview'); preview.innerHTML=''; card._newImages = [];
    if(!files.length) return;
    files.forEach((f,idx)=>{ const r=new FileReader(); r.onload=()=>{ const data=r.result; card._newImages.push(data); const div=document.createElement('div'); div.className='thumb'; div.innerHTML = `<img src="${data}" alt="new-${idx}"><button class="remove-btn" data-idx="${idx}">✕</button>`; preview.appendChild(div); div.querySelector('.remove-btn').addEventListener('click', function(){ const i=Number(this.getAttribute('data-idx')); card._newImages[i]=null; div.remove(); card._newImages = card._newImages.filter(x=>x); }); }; r.readAsDataURL(f); });
  });

  const eTotal = document.getElementById('e_total');
  const eCash = document.getElementById('e_cash');
  const eQR = document.getElementById('e_qr');
  const eCard = document.getElementById('e_card');

  if (item.store !== 'TikTok' && item.store !== 'B2B') {
    const recalc = () => {
      const cash = parseNum(eCash.value);
      const qr = parseNum(eQR.value);
      const card = parseNum(eCard.value);
      eTotal.value = (cash + qr + card).toFixed(2);
    };
    eCash.addEventListener('input', recalc);
    eQR.addEventListener('input', recalc);
    eCard.addEventListener('input', recalc);
  }

  document.getElementById('e_cancel').addEventListener('click', closeEditModal);
  document.getElementById('e_save').addEventListener('click', function(){
    const form = document.getElementById('adminEditForm'); if(form) form.requestSubmit();
  });

  document.getElementById('adminEditForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    const edited = {
      date: $('e_date').value,
      total: parseNum($('e_total').value), cash: parseNum($('e_cash').value), qr: parseNum($('e_qr').value), card: parseNum($('e_card').value), remarks: $('e_remarks').value||''
    };
    if(!edited.date){
      alert('Date is required.'); return;
    }
    if(item.store !== 'TikTok' && item.store !== 'B2B'){
      if(Math.abs((edited.cash+edited.qr+edited.card)-edited.total) > 0.009){
        $('e_err').classList.remove('hidden'); return;
      }
    }
    const submissions = loadSubmissions();
    const original = Object.assign({}, submissions[idx]);
    // apply edits
    submissions[idx].date = edited.date;
    submissions[idx].total = edited.total; submissions[idx].cash = edited.cash; submissions[idx].qr = edited.qr; submissions[idx].card = edited.card; submissions[idx].remarks = edited.remarks;
    if(item.store==='B2B'){
      submissions[idx].clientName = $('e_client').value||''; submissions[idx].quotationNo = $('e_quot').value||''; submissions[idx].invoiceNo = $('e_inv').value||'';
    }
    // merge existing (non-removed) and new images
    const kept = (card._existingImages||[]).filter(x=>x);
    const added = (card._newImages||[]).filter(x=>x);
    submissions[idx].proofImages = kept.concat(added);
    const hist = { original: { total: original.total, cash: original.cash, qr: original.qr, card: original.card, remarks: original.remarks }, edited: { total: edited.total, cash: edited.cash, qr: edited.qr, card: edited.card, remarks: edited.remarks }, editedAt: Date.now(), editedBy: 'Admin' };
    submissions[idx].history = submissions[idx].history||[]; submissions[idx].history.push(hist);
    saveSubmissions(submissions); closeEditModal(); renderDashboard(); renderHistory();
  });
}

window.deleteRecord = function(id){
  if(!confirm('Are you sure you want to delete this sales record?')) return;
  const subs = loadSubmissions();
  const idx = subs.findIndex(s=>s.id==id);
  if(idx===-1) return alert('Record not found.');
  subs.splice(idx,1);
  saveSubmissions(subs);
  renderDashboard();
  renderHistory();
};

window.openAddRecordModal = function(){
  const card = $('editCard');
  const body = $('editCardBody');
  const footer = $('editCardFooter');

  let html = `<h3>Add Sales Record</h3>`;
  html += `<form id="adminAddForm">
    <label class="label">Date</label>
    <input type="date" class="input" id="add_date" value="${getToday()}">

    <label class="label">Store</label>
    <select id="add_store" class="select">
      ${STORES.map(s=>`<option value="${s}">${s}</option>`).join('')}
    </select>

    <label class="label">Total Sales</label>
    <input type="number" min="0" step="0.01" class="input" id="add_total" placeholder="0.00" value="0.00">

    <div id="add_breakdown_fields">
      <label class="label">Cash Sales</label>
      <input type="number" min="0" step="0.01" class="input" id="add_cash" placeholder="0.00" value="0.00">

      <label class="label">QR / Transfer Sales</label>
      <input type="number" min="0" step="0.01" class="input" id="add_qr" placeholder="0.00" value="0.00">

      <label class="label">Card Sales</label>
      <input type="number" min="0" step="0.01" class="input" id="add_card" placeholder="0.00" value="0.00">
    </div>

    <div id="add_b2b_fields" class="hidden">
      <label class="label">Client / Company Name (optional)</label>
      <input type="text" id="add_client" class="input" placeholder="Company name">
      <label class="label">Quotation Number (optional)</label>
      <input type="text" id="add_quot" class="input" placeholder="Quotation #">
      <label class="label">Invoice Number (optional)</label>
      <input type="text" id="add_inv" class="input" placeholder="Invoice #">
    </div>

    <label class="label">Remarks (optional)</label>
    <textarea class="textarea" id="add_remarks" placeholder="Notes..."></textarea>

    <div id="add_err" class="error hidden">Breakdown does not match total sales.</div>
  </form>`;

  body.innerHTML = html;
  footer.innerHTML = `<div style="display:flex;gap:8px;justify-content:flex-end;background:transparent;padding-top:8px"><button type="button" class="secondary" id="add_cancel">Cancel</button> <button type="button" class="primary" id="add_save">Save</button></div>`;

  $('editModal').classList.add('show');

  const storeSelect = document.getElementById('add_store');
  const toggleFields = () => {
    const store = storeSelect.value;
    const breakdown = document.getElementById('add_breakdown_fields');
    const b2b = document.getElementById('add_b2b_fields');
    if(store==='TikTok'){
      if(breakdown) breakdown.classList.add('hidden');
      if(b2b) b2b.classList.add('hidden');
    } else if(store==='B2B'){
      if(breakdown) breakdown.classList.add('hidden');
      if(b2b) b2b.classList.remove('hidden');
    } else {
      if(breakdown) breakdown.classList.remove('hidden');
      if(b2b) b2b.classList.add('hidden');
    }
  };
  storeSelect.addEventListener('change', () => {
    toggleFields();
    recalculateTotal();
  });
  toggleFields();

  // Auto-calculate total from breakdown for retail stores
  const totalInput = document.getElementById('add_total');
  const cashInput = document.getElementById('add_cash');
  const qrInput = document.getElementById('add_qr');
  const cardInput = document.getElementById('add_card');

  const recalculateTotal = () => {
    const store = storeSelect.value;
    if(store !== 'TikTok' && store !== 'B2B'){
      const cash = parseNum(cashInput.value);
      const qr = parseNum(qrInput.value);
      const card = parseNum(cardInput.value);
      totalInput.value = (cash + qr + card).toFixed(2);
    }
  };

  cashInput.addEventListener('input', recalculateTotal);
  qrInput.addEventListener('input', recalculateTotal);
  cardInput.addEventListener('input', recalculateTotal);

  document.getElementById('add_cancel').addEventListener('click', closeEditModal);
  document.getElementById('add_save').addEventListener('click', function(){
    document.getElementById('adminAddForm').requestSubmit();
  });

  document.getElementById('adminAddForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    const date = $('add_date').value;
    const store = $('add_store').value;
    const total = parseNum($('add_total').value);
    const remarks = $('add_remarks').value || '';

    if(!date || !store){
      alert('Please select date and store.');
      return;
    }

    let cash = 0, qr = 0, card = 0;
    let clientName = '', quotationNo = '', invoiceNo = '';

    if(store !== 'TikTok' && store !== 'B2B'){
      cash = parseNum($('add_cash').value);
      qr = parseNum($('add_qr').value);
      card = parseNum($('add_card').value);
      if(Math.abs((cash + qr + card) - total) > 0.009){
        $('add_err').classList.remove('hidden');
        return;
      }
    }

    if(store === 'B2B'){
      clientName = $('add_client').value || '';
      quotationNo = $('add_quot').value || '';
      invoiceNo = $('add_inv').value || '';
    }

    const submissions = loadSubmissions();
    const entry = {
      id: Date.now() + Math.floor(Math.random()*1000),
      recordType: 'legacy_bookkeeping',
      source: 'Manual',
      date,
      store,
      total,
      cash,
      qr,
      card,
      remarks,
      clientName,
      quotationNo,
      invoiceNo,
      status: 'Submitted',
      time: timeNow(),
      submittedAt: Date.now(),
      history: []
    };

    submissions.push(entry);
    saveSubmissions(submissions);
    closeEditModal();
    renderDashboard();
    renderHistory();
  });
};

document.addEventListener('DOMContentLoaded', init);
