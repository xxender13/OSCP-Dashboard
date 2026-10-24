'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usable = value => typeof value === 'number' && Number.isFinite(value);
const number = value => usable(value) ? value.toLocaleString('en-US', {maximumFractionDigits:2}) : 'Unavailable';
const ENROLL = '2025–26 K–12';
const charts = {};
let data;
function selectedSchools() {
  return data.schools.filter(s => $('schoolSelect').value === 'all' || s['DESE LEA'] === $('schoolSelect').value);
}
function table(target, caption, headers, rows) {
  $(target).innerHTML = `<table><caption>${esc(caption)}</caption><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function chart(id, rows, fields, labels, percent) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  if (!window.Chart) return;
  const colors = ['#003DA5', '#85651d'];
  const valueLabels = {id:'valueLabels', afterDatasetsDraw(c) {
    const ctx = c.ctx; ctx.save(); ctx.font = '11px system-ui'; ctx.fillStyle = '#172b45';
    c.data.datasets.forEach((set, index) => c.getDatasetMeta(index).data.forEach((bar, i) => {
      const value = set.data[i]; ctx.textBaseline = 'middle'; ctx.fillText(`${number(value)}${percent ? '%' : ''}`, bar.x + 5, bar.y);
    })); ctx.restore();
  }};
  charts[id] = new Chart($(id), {type:'bar', data:{labels:rows.map(s => s.School), datasets:fields.map((field,i) => ({label:labels[i],data:rows.map(s=>s[field]),backgroundColor:colors[i],borderRadius:3,maxBarThickness:24}))}, plugins:[valueLabels], options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{right:55}},plugins:{legend:{display:fields.length>1,position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${number(ctx.raw)}${percent?'%':' students'}`}}},scales:{x:{beginAtZero:true,...(percent?{max:100}:{}),title:{display:true,text:percent?'Percent (%)':'Students'},ticks:{precision:percent?1:0},grid:{color:'#e7edf5'}},y:{grid:{display:false},ticks:{autoSkip:false,font:{size:11},callback:function(value){const label=this.getLabelForValue(value);const limit=this.chart.width<500?12:24;return label.length>limit ? label.split(' ').reduce((lines,word)=>{if((lines[lines.length-1]+' '+word).length>limit)lines.push(word);else lines[lines.length-1]+=(lines[lines.length-1]?' ':'')+word;return lines;},['']) : label;}}}}}});
}
function render() {
  const schools = selectedSchools();
  const previousMetric = $('metricSelect').value;
  const availableMetrics = data.metrics.filter(m=>schools.some(s=>usable(s[m.id])));
  $('metricSelect').replaceChildren(...availableMetrics.map(m=>new Option(`${m.label} · ${m.period}`,m.id)));
  $('metricSelect').value = availableMetrics.some(m=>m.id===previousMetric) ? previousMetric : ENROLL;
  const metric = data.metrics.find(m=>m.id === $('metricSelect').value);
  const total = schools.every(s=>usable(s[ENROLL])) ? schools.reduce((sum,s)=>sum+s[ENROLL],0) : null;
  $('filterContext').textContent = `${$('schoolSelect').selectedOptions[0].textContent} · ${schools.length} of ${data.schools.length} school records · ${metric.label} · ${metric.period}. School selection applies to enrollment, comparisons, and the directory.`;
  $('kpis').innerHTML = `<div class="kpi"><span>Sponsored schools in selection</span><strong>${schools.length}</strong><small>Unique DESE charter identifiers · six-school cohort</small></div>${total === null ? '' : `<div class="kpi"><span>Preliminary K–12 enrollment</span><strong>${number(total)}</strong><small>2025–26 · selected schools · preschool excluded</small></div>`}`;
  const reported = schools.filter(s=>usable(s[metric.id])).sort((a,b)=>b[metric.id]-a[metric.id]);
  $('comparisonTitle').textContent = `${metric.label} · ${metric.period}`;
  $('metricUnit').textContent = metric.unit === '%' ? 'Percent · 0–100%' : 'Students · K–12';
  $('comparisonNote').textContent = `${reported.length} of ${schools.length} selected schools have reportable values.${metric.id.includes('P+A') ? ' MAP measures tested students; suppressed components are not reconstructed.' : ''}${['Black %','Hispanic %','Multiracial %','White %'].includes(metric.id) ? ' This is a separate category comparison, not a complete racial/ethnic composition.' : ''}${!reported.length ? ' No reportable values in this selection. Choose another metric to compare schools.' : ''}`;
  $('comparisonPlot').hidden = !reported.length || !window.Chart;
  $('comparisonData').hidden = !reported.length;
  if (reported.length) {
    chart('comparisonChart',reported,[metric.id],[metric.label],metric.unit==='%');
    table('comparisonData',`Chart values · ${metric.period}`,['School',`${metric.label} (${metric.unit})`],reported.map(s=>[s.School,number(s[metric.id])]));
  } else if(charts.comparisonChart) { charts.comparisonChart.destroy(); delete charts.comparisonChart; }
  const map = schools.filter(s=>usable(s['MAP ELA P+A %'])&&usable(s['MAP Math P+A %']));
  $('mapPanel').hidden = !map.length;
  if (map.length) {
    $('mapNote').textContent = `${map.length} of ${schools.length} selected schools have both publicly reportable subjects. Other schools are excluded. All values use 2025 charter-level records.`;
    $('mapPlot').hidden = !window.Chart;
    chart('mapChart',map,['MAP ELA P+A %','MAP Math P+A %'],['ELA','Math'],true);
    table('mapData','Paired proficiency values · 2025',['School','ELA P+A (%)','Math P+A (%)'],map.map(s=>[s.School,number(s['MAP ELA P+A %']),number(s['MAP Math P+A %'])]));
  } else if(charts.mapChart) { charts.mapChart.destroy(); delete charts.mapChart; }
  const fields = ['FRL %','EL %','IEP incidence %','MAP ELA P+A %','MAP Math P+A %'].filter(k=>schools.some(s=>usable(s[k])));
  table('schoolTable',`${schools.length} selected school records · source: Cohort Master`,['School','DESE LEA','SLU sponsorship start','K–12 · 2025–26 preliminary',...fields.map(k=>`${k} · 2025`)],schools.map(s=>[s.School,s['DESE LEA'],s['SLU sponsor since'],number(s[ENROLL]),...fields.map(k=>number(s[k]))]));
  $('reachCount').textContent = number(total);
  $('reachContext').textContent = `${schools.length} selected ${schools.length===1?'school':'schools'} · ${$('schoolSelect').selectedOptions[0].textContent}. Each charter school is counted once.`;
  const enrollment = schools.filter(s=>usable(s[ENROLL])).sort((a,b)=>b[ENROLL]-a[ENROLL]);
  $('reachPlot').hidden = !window.Chart;
  chart('reachChart',enrollment,[ENROLL],['Preliminary K–12 enrollment'],false);
  table('reachData','Enrollment values · 2025–26 preliminary',['School','K–12 students'],enrollment.map(s=>[s.School,number(s[ENROLL])]));
}
fetch('./dashboard-data.json').then(response=>{if(!response.ok)throw Error('Unable to retrieve dashboard-data.json');return response.json();}).then(payload=>{
  data = payload;
  if(!Array.isArray(data.schools)||!data.schools.length||!data.metrics?.length)throw Error('No validated school data is available');
  data.schools.forEach(s=>$('schoolSelect').add(new Option(s.School,s['DESE LEA'])));
  data.metrics.forEach(m=>$('metricSelect').add(new Option(`${m.label} · ${m.period}`,m.id)));
  $('schoolSelect').addEventListener('change',render);
  $('metricSelect').addEventListener('change',render);
  $('filters').addEventListener('submit',e=>e.preventDefault());
  $('filters').addEventListener('reset',()=>{setTimeout(render,0);});
  $('sourceList').innerHTML = '<ul>'+data.sources.map(s=>`<li><strong>${esc(s.Dataset)}</strong> · ${esc(s['Reporting period'])}<br>${esc(s['Uploaded source filename'])}</li>`).join('')+'</ul>';
  $('definitions').innerHTML = Object.values(data.definitions).map(value=>`<p>${esc(value)}</p>`).join('');
  $('generatedAt').textContent = `Data generated ${new Date(data.generated_at).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC · Reporting periods are listed with each metric.`;
  $('dashboard').hidden = false;
  $('loadStatus').hidden = true;
  $('chartFallback').hidden = Boolean(window.Chart);
  render();
}).catch(error=>{$('loadStatus').hidden=false;$('loadStatus').textContent = `The dashboard could not load. Please try again later. For local preview, run python build.py and serve dist/ with a local web server. ${error.message}`;});
