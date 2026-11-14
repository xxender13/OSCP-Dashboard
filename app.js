'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => valid(v) ? v.toLocaleString('en-US',{maximumFractionDigits:2}) : 'Not in supplied source';
const colors = ['#003DA5','#687887','#007875','#764e9b','#ad463e','#85651d'];
const shapes = ['circle','rect','triangle','rectRot','crossRot','star'];
const charts = {}, exportsByReport = {};
let data;
const names = { 'FRL %':'Free / reduced-price lunch','EL %':'English learners','IEP incidence %':'Special education · IEP incidence','Black %':'Black','Hispanic %':'Hispanic','Multiracial %':'Multiracial','White %':'White'};
const assessmentMetrics = {PA_PCT:'Proficient + Advanced (%)',PROFICIENT_PCT:'Proficient (%)',ADVANCED_PCT:'Advanced (%)',BASIC_PCT:'Basic (%)',BELOW_BASIC_PCT:'Below Basic (%)',LEVEL_NOT_DETERMINED_PCT:'Level not determined (%)',REPORTABLE:'Reportable tested students',ACCOUNTABLE:'Accountable students',PROFICIENT:'Proficient students',ADVANCED:'Advanced students',BASIC:'Basic students',BELOW_BASIC:'Below Basic students',LEVEL_NOT_DETERMINED:'Level not determined students'};
const enrollmentMetrics = { '2025–26 K–12':'K–12 · 2025–26 preliminary','2025–26 PK':'Preschool · 2025–26 preliminary','2025 K–12':'K–12 · 2025'};

function options(id, entries, fallback) {
  const node=$(id), previous=node.value;
  node.replaceChildren(...entries.map(([value,label])=>new Option(label,String(value))));
  node.value=entries.some(([v])=>String(v)===previous)?previous:String(entries.some(([v])=>String(v)===String(fallback))?fallback:entries[0]?.[0]??'');
}
function schoolEntries() { return [['all','All networks'],...data.schools.map(s=>[s['DESE LEA'],s.School])]; }
function control(id,label,entries) { return `<div><label for="${id}">${esc(label)}</label><select id="${id}">${entries.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`; }
function schoolControl(id) {return control(id,'School',schoolEntries());}
function levelControl(id) {return control(id,'Reporting level',[['Charter','Charter networks'],['Building','Individual school records']]);}
function sortControl(id) {return control(id,'Sort by',[['desc','Value: high to low'],['asc','Value: low to high'],['name','Name: A–Z']]);}
function report(id,mount,title,description,controls,source) {
  const article=`<article id="${id}Panel" class="panel report" tabindex="-1"><div class="chart-heading"><div><p class="eyebrow">${id==='matchedMap'?'COMPARE THE SAME GRADE':'DETAILED DATA EXPLORER'}</p><h3 id="${id}Title">${esc(title)}</h3></div><button type="button" class="download" data-export="${id}">Download CSV</button></div><p class="report-description">${esc(description)}</p><form class="local-filters" id="${id}Filters">${controls}<button type="reset">Reset</button></form><p id="${id}Context" class="context" aria-live="polite"></p><div id="${id}Insight" class="insight"></div><div id="${id}Legend" class="legend" aria-label="Chart legend"></div><div id="${id}Plot" class="plot"><canvas id="${id}Chart" role="img" aria-labelledby="${id}Title" aria-describedby="${id}Context ${id}Insight"></canvas></div><details class="data-disclosure" id="${id}TableDisclosure"><summary>View data table<span class="sr-only">: ${esc(title)}</span></summary><div id="${id}Data" class="scroll" tabindex="0" role="region" aria-label="${esc(title)} values"></div></details><details class="source-details"><summary>Sources &amp; how to read this report</summary><div id="${id}Reference" class="reference" hidden></div><p class="source">${esc(source)}</p><p class="missing-footnote">${esc(data.missing_data_note)}</p></details></article>`;
  $(mount).innerHTML=id==='matchedMap'?article:`<details class="report-disclosure" id="${id}Disclosure"><summary><span>${esc(title)}<small>${esc(description)}</small></span></summary>${article}</details>`;
  const basic={matchedMap:['matchedSubject','matchedGrade','matchedSchool'],demographics:['demoSchool','demoMetric'],enrollment:['enrollSchool','enrollMetric'],assessment:['mapSchool','mapSubject'],growth:['growthSchool','growthSubject'],history:['historySchool','historyMetric'],timeline:['timelineSchool'],frl:['frlSchool'],schoolList:['schoolListSchool','schoolListSearch'],coverage:['coverageSchool'],directory:['directorySchool','directorySearch']}[id];
  const form=$(id+'Filters'),advanced=[];
  [...form.children].filter(n=>n.tagName==='DIV').forEach(node=>{node.classList.add('filter-field');if(!basic.includes(node.querySelector('select,input').id))advanced.push(node);});
  if(advanced.length){const details=document.createElement('details');details.className='advanced-filters';details.innerHTML='<summary>Advanced filters</summary><div class="advanced-fields"></div>';advanced.forEach(n=>details.lastElementChild.append(n));form.insertBefore(details,form.lastElementChild);}
  if(id==='matchedMap')basic.forEach(key=>{const node=$(key)?.closest('.filter-field');if(node)form.insertBefore(node,form.querySelector('.advanced-filters'));});
  $(id+'Disclosure')?.addEventListener('toggle',()=>{if($(id+'Disclosure').open)renderers[id]();});
}
function table(id,caption,headers,rows) {
  $(id).innerHTML=`<table><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i?`<td>${esc(valid(v)?(/year|since/i.test(headers[i])?String(v):fmt(v)):v??tableMissing(id,headers,r,i))}</td>`:`<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function storeTable(id,caption,headers,rows) {
  exportsByReport[id]={headers,rows};table(id+'Data',caption,headers,rows);updateReportMetadata(id);
  const advanced=$(id+'Filters').querySelector('.advanced-filters');
  if(advanced){const selections=[...advanced.querySelectorAll('select')].map(s=>s.selectedOptions[0]?.textContent).filter(Boolean);advanced.querySelector('summary').textContent='Advanced filters'+(selections.length?' · '+selections.join(' / '):'');}
}
function legend(id,series,type='bar') {
  const symbols={circle:'●',rect:'■',triangle:'▲',rectRot:'◆',crossRot:'×',star:'✦'};
  $(id+'Legend').innerHTML=series.map((s,i)=>`<span>${type==='bar'?`<b style="background:${s.options?.backgroundColor??s.color??colors[i%colors.length]};${s.options?.borderWidth?'border:1.5px solid '+(s.color??colors[i%colors.length]):''}"></b>`:`<b class="point-key" style="color:${s.color??colors[i%colors.length]}" aria-hidden="true">${symbols[s.options?.pointStyle??shapes[i%shapes.length]]}</b>`}${esc(s.label)}</span>`).join('');
}
function destroy(id) {if(charts[id]){charts[id].destroy();delete charts[id];}}
function wrapLabel(label,limit) {return String(label).split(' ').reduce((lines,w)=>{if((lines.at(-1)+' '+w).trim().length>limit&&lines.at(-1))lines.push(w);else lines[lines.length-1]+=(lines.at(-1)?' ':'')+w;return lines;},['']);}
function draw(id,type,labels,series,unit,extra={}) {
  destroy(id);
  const available=series.some(s=>s.values.some(v=>valid(v)||v&&valid(v.x)&&valid(v.y)));
  $(id+'Plot').hidden=!window.Chart||!available;
  legend(id,series,type);
  if(!window.Chart)$(id+'TableDisclosure').open=true;
  if($(id+'Disclosure')&&!$(id+'Disclosure').open)return;
  if(!window.Chart||!available)return;
  const horizontal=type==='bar';
  $(id+'Plot').style.height=horizontal?`${Math.max(320,labels.length*(series.length>1?75:58)+70)}px`:'360px';
  const plugin={id:'barValues',afterDatasetsDraw(c){if(!horizontal)return;const ctx=c.ctx;ctx.save();ctx.fillStyle='#172b45';ctx.font='12px system-ui';c.data.datasets.forEach((set,i)=>{if(!c.isDatasetVisible(i))return;c.getDatasetMeta(i).data.forEach((bar,j)=>{if(valid(set.data[j]))ctx.fillText(`${fmt(set.data[j])}${unit==='%'?'%':''}`,bar.x+5,bar.y+4);});});ctx.restore();}};
  const percentAxis={beginAtZero:true,...(unit==='%'?{max:100}:{}),title:{display:true,text:unit==='%'?'Percent (%)':unit},grid:{color:'#e6edf5'},ticks:{precision:unit==='%'?1:0}};
  const scales=horizontal?{x:percentAxis,y:{grid:{display:false},ticks:{autoSkip:false,font:{size:11},callback:function(v){return wrapLabel(this.getLabelForValue(v),this.chart.width<500?12:24);}}}}:type==='line'?{x:{title:{display:true,text:'Reporting year'},grid:{display:false},ticks:{maxTicksLimit:8}},y:percentAxis}:extra.scales;
  charts[id]=new Chart($(id+'Chart'),{type,data:{labels,datasets:series.map((s,i)=>({label:s.label,data:s.values,backgroundColor:s.color??colors[i%colors.length],borderColor:s.color??colors[i%colors.length],pointStyle:shapes[i%shapes.length],pointRadius:4,borderWidth:type==='line'?2:0,maxBarThickness:24,borderRadius:3,spanGaps:false,...s.options}))},plugins:[plugin],options:{indexAxis:horizontal?'y':'x',responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{right:horizontal?60:16,top:12}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(horizontal?ctx.parsed.x:ctx.parsed.y)}${unit==='%'?'%':''}`}}},scales,...extra.options}});
}
function selected(id,rows) {const value=$(id).value;return rows.filter(r=>value==='all'||(r.lea??r['DESE LEA'])===value);}
function records(schoolId,levelId) {
  const buildings=$(levelId).value==='Building';
  return selected(schoolId,buildings?data.buildings:data.schools).map(r=>({...r,label:buildings?`${r['Building name']} · ${r['Building code']}`:r.School,
    '2025–26 K–12':r[buildings?'K–12 prelim':'2025–26 K–12'],'2025–26 PK':r[buildings?'PK prelim':'2025–26 PK']}));
}
function sortRows(rows,field,id) {return [...rows].sort((a,b)=>$(id).value==='name'?a.label.localeCompare(b.label):($(id).value==='asc'?1:-1)*(a[field]-b[field]));}
function metricOptions(id,definitions,rows,fallback) {options(id,Object.entries(definitions).filter(([key])=>rows.some(r=>valid(r[key]))),fallback);}
function reason(row,fields) {return fields.filter(f=>row[f]===null).map(f=>`${f}: ${row.missingness?.[f]?.detail??'Not reported or unavailable in source.'}`).join(' ')||'All selected values reported';}
function reference(id,html) {$(id+'Reference').innerHTML=html;$(id+'Reference').hidden=!html;}
function officialContext(field) {
  const b=data.benchmarks[field];
  if(!b||!valid(b.value))return `<strong>Missouri comparison: Unavailable*</strong><p>${esc(b?.reason??'A complete official population and denominator were not verified.')}</p>`;
  return `<strong>${esc(b.label)} · ${esc(b.year)}: ${fmt(b.value)}%</strong><p>${esc(b.population)}. This is an official published rate, not an average of districts. Underlying ${b.numerator===null?'numerator and ':''}denominator counts not printed are not reconstructed. No percentage-point gap is calculated.</p><p><a href="${esc(b.source_url)}" target="_blank" rel="noopener">Official DESE source${b.source_page?' · page '+b.source_page:''}</a></p>`;
}

function renderDemographics() {
  const id='demographics',rows=records('demoSchool','demoLevel');
  metricOptions('demoMetric',names,rows,'FRL %');const field=$('demoMetric').value;
  const reportable=sortRows(rows.filter(r=>valid(r[field])),field,'demoSort');
  $('demographicsContext').textContent=`2025 · ${$('demoLevel').selectedOptions[0].textContent} · ${reportable.length} of ${rows.length} records report ${names[field]}.`;
  $('demographicsInsight').textContent=field==='FRL %'?'FRL describes eligibility for free or reduced-price lunch; it is not a direct measure of household income.':field==='IEP incidence %'?'IEP incidence follows the DESE source definition; it is not recalculated from rounded percentages.':field==='EL %'?'English learners are students identified in the source EL field. Unavailable groups are not assumed to be absent.':'This is one reported racial/ethnic category. Categories are incomplete; do not interpret this chart as the full student composition.';
  const fieldKey={'Black %':'black','FRL %':'frl','IEP incidence %':'iep','EL %':'el','White %':'white','Hispanic %':'hispanic','Multiracial %':'multiracial'}[field];
  reference(id,fieldKey?officialContext(fieldKey):'<strong>Missouri comparison: Unavailable*</strong><p>No complete independently verified statewide reference for this selected category is included. No suppressed remainder is estimated.</p>');
  draw(id,'bar',reportable.map(r=>r.label),[{label:`${names[field]} · 2025 (%)`,values:reportable.map(r=>r[field])}],'%');
  storeTable(id,'All selected demographic records · 2025; graph includes reported values only',['School / building',`${names[field]} (%)`,'LEA','Source worksheet','Source row','Missingness note'],rows.map(r=>[r.label,r[field],r['DESE LEA'],$('demoLevel').value==='Building'?'Building Cohort':'Cohort Master',r.source_row,reason(r,[field])]));
}
function renderEnrollment() {
  const id='enrollment',rows=records('enrollSchool','enrollLevel');
  metricOptions('enrollMetric',enrollmentMetrics,rows,'2025–26 K–12');const field=$('enrollMetric').value;
  const reportable=sortRows(rows.filter(r=>valid(r[field])),field,'enrollSort');
  const total=reportable.reduce((sum,r)=>sum+r[field],0),complete=reportable.length===rows.length;
  $('enrollmentContext').textContent=`${enrollmentMetrics[field]} · ${$('enrollLevel').selectedOptions[0].textContent} · ${reportable.length} of ${rows.length} records report a value.`;
  $('enrollmentInsight').innerHTML=`<strong id="reachCount">${fmt(total)}</strong> ${complete?'students in the selected records':'students in reportable records only; not a complete total'}. ${field.includes('PK')?'Preschool is shown separately. It is not added to K–12 to reconstruct missing PK–12 totals.':'Each record is counted once at the chosen reporting level. Preliminary and historical periods are separate.'}`;
  const state=data.official_state_context.enrollment;
  reference(id,`<strong>Official Missouri fall K–12 enrollment · ${esc(state.year)}: ${fmt(state.value)}</strong><p>Published state total: 580,175 K–8 + 276,047 grades 9–12. This historical context does not describe 2025–26 preliminary enrollment or 2026–27 enrollment. No mixed-year ratio is shown. <a href="${esc(state.source_url)}" target="_blank" rel="noopener">DESE statistics · page 1</a></p>`);
  draw(id,'bar',reportable.map(r=>r.label),[{label:enrollmentMetrics[field]+' · students',values:reportable.map(r=>r[field])}],'Students');
  storeTable(id,enrollmentMetrics[field],['School / building','Students','LEA','Source worksheet','Source row'],reportable.map(r=>[r.label,r[field],r['DESE LEA'],$('enrollLevel').value==='Building'?'Building Cohort':'Cohort Master',r.source_row]));
}
function assessmentBase() {return selected('mapSchool',data.assessments).filter(r=>r.level===$('mapLevel').value);}
function renderAssessment() {
  const id='assessment',base=assessmentBase();
  const groupPairs=[...new Map(base.map(r=>[JSON.stringify([r.category,r.group]),`${r.group} · ${r.category.replace('MSIP ','')}`])).entries()];
  const usableGroups=groupPairs.filter(([g])=>base.some(r=>JSON.stringify([r.category,r.group])===g&&Object.keys(assessmentMetrics).some(k=>valid(r[k]))));
  options('mapGroup',usableGroups,JSON.stringify(['MSIP Total','Total']));
  const group=base.filter(r=>JSON.stringify([r.category,r.group])===$('mapGroup').value);
  metricOptions('mapMetric',assessmentMetrics,group,'PA_PCT');const field=$('mapMetric').value,unit=field.endsWith('_PCT')?'%':'Students';
  const subjects=[...new Set(group.filter(r=>valid(r[field])).map(r=>r.subject))];
  options('mapSubject',[['all','All reportable subjects'],...subjects.map(s=>[s,s])],'all');
  const scope=group.filter(r=>$('mapSubject').value==='all'||r.subject===$('mapSubject').value);
  const reportable=scope.filter(r=>valid(r[field]));
  const key=r=>`${r.lea}/${r.building??''}`;
  const entities=[...new Map(reportable.map(r=>[key(r),r.name])).entries()];
  const chosenSubjects=subjects.filter(s=>$('mapSubject').value==='all'||s===$('mapSubject').value);
  const series=chosenSubjects.map(s=>({label:`${s} · ${assessmentMetrics[field]}`,values:entities.map(([k])=>reportable.find(r=>key(r)===k&&r.subject===s)?.[field]??null),color:colors[['Eng. Language Arts','Mathematics','Science','Social Studies'].indexOf(s)]}));
  $('assessmentContext').textContent=`2025 · ${$('mapLevel').selectedOptions[0].textContent} · ${$('mapGroup').selectedOptions[0]?.textContent??''} · ${reportable.length} of ${scope.length} supplied subject records have reportable ${assessmentMetrics[field]}. Absent source slices are not counted as zero.`;
  const unknown=group.some(r=>r.group==='Student Group');
  $('assessmentInsight').textContent=unknown?'“Student Group” is the source’s label; its membership is not defined in the supplied workbook. Interpret this slice cautiously.':'Compare the same student group within each subject. Subjects can have different tested students; student groups overlap. Never add subject or group counts together. P+A requires both published counts and a reportable denominator.';
  const state=data.state_map.filter(r=>JSON.stringify([r.category,r.group])===$('mapGroup').value&&($('mapSubject').value==='all'||r.subject===$('mapSubject').value));
  reference(id,'<strong>Missouri 2025 MSIP all-tested-grades proficiency reference</strong><p>These state totals remain contextual. <a href="#matchedMapPanel">Open the independently verified single-grade/course comparison</a> for exact grade/group matching. The grade exports use a different reporting population; they are not silently mixed with these MSIP aggregates or interpreted as official school targets.</p>'+state.map(r=>`<p>${esc(r.subject)}: ${fmt(r.value)}% P+A · ${fmt(r.numerator)} / ${fmt(r.denominator)} reportable students · ${esc(r.group)}.</p>`).join('')+(state.length?'':'<p>Unavailable*: no matching state subject/student-group row in the supplied source.</p>'));
  draw(id,'bar',entities.map(([,name])=>name),series,unit);
  const headers=['School / building','Subject',assessmentMetrics[field],'Reportable tested','Accountable','Below Basic count','Basic count','Proficient count','Advanced count','Level not determined count','Below Basic (%)','Basic (%)','Proficient (%)','Advanced (%)','Level not determined (%)','LEA','Building code','Source file','Source row'];
  headers.push('Missingness note');
  storeTable(id,'All selected source records · 2025 · unavailable fields are not reconstructed',headers,scope.map(r=>[r.name,r.subject,r[field],r.REPORTABLE,r.ACCOUNTABLE,r.BELOW_BASIC,r.BASIC,r.PROFICIENT,r.ADVANCED,r.LEVEL_NOT_DETERMINED,r.BELOW_BASIC_PCT,r.BASIC_PCT,r.PROFICIENT_PCT,r.ADVANCED_PCT,r.LEVEL_NOT_DETERMINED_PCT,r.lea,r.building??'Charter',r.source_file,r.source_row,reason(r,[field,'PROFICIENT','ADVANCED','REPORTABLE'])]));
}
function renderHistory() {
  const id='history',base=selected('historySchool',data.history);
  const availableYears=[...new Set(base.map(r=>r.Year))].sort((a,b)=>a-b);
  options('historyStart',availableYears.map(y=>[y,y]),availableYears[0]);
  const from=Number($('historyStart').value);
  options('historyEnd',availableYears.filter(y=>y>=from).map(y=>[y,y]),availableYears.at(-1));
  const to=Number($('historyEnd').value),years=Array.from({length:to-from+1},(_,i)=>from+i);
  const rows=base.filter(r=>r.Year>=from&&r.Year<=to);
  metricOptions('historyMetric',{'K–12 enrollment':'K–12 enrollment',...names},rows,'K–12 enrollment');
  const field=$('historyMetric').value,fieldName=names[field]??field;
  const schools=data.schools.filter(s=>rows.some(r=>r['DESE LEA']===s['DESE LEA']&&valid(r[field])));
  const series=schools.map(s=>({label:s.School,values:years.map(y=>rows.find(r=>r['DESE LEA']===s['DESE LEA']&&r.Year===y)?.[field]??null),color:colors[data.schools.indexOf(s)]}));
  const reported=rows.filter(r=>valid(r[field]));
  $('historyContext').textContent=`${from}–${to} · ${fieldName} · ${reported.length} of ${rows.length} supplied school-year records report a value · ${schools.length} schools shown.`;
  $('historyInsight').textContent='Read each line as one school’s historical record. Gaps stay disconnected, and school coverage varies by year. These records can predate SLU sponsorship; changes are not evidence of sponsorship effects. Preliminary 2025–26 enrollment is not appended.';
  draw(id,'line',years.map(String),series,field.includes('%')?'%':'Students');
  storeTable(id,`Historical ${fieldName} · ${from}–${to}`,['School','Reporting year',fieldName,'LEA','Source worksheet','Source row'],rows.sort((a,b)=>a.School.localeCompare(b.School)||a.Year-b.Year).map(r=>[r.School,r.Year,r[field],r['DESE LEA'],'Historical Demographics',r.source_row]));
}
function renderTimeline() {
  const rows=selected('timelineSchool',data.schools),mode=$('timelineEvent').value;
  const specs=[['opened','Opened school year (start)',s=>Number(String(s['Opened school year']).slice(0,4))],['sponsor','SLU sponsorship since',s=>s['SLU sponsor since']]].filter(([id])=>mode==='both'||mode===id);
  const series=specs.map(([id,label,get])=>({label,values:rows.map((s,i)=>({x:get(s),y:i})),options:{pointRadius:6,pointStyle:id==='opened'?'circle':'rectRot'},color:id==='opened'?colors[0]:colors[1]}));
  $('timelineContext').textContent=`${rows.length} selected schools · Source years for opening and sponsorship milestones.`;
  $('timelineInsight').textContent='A school’s opening and the start of SLU sponsorship are different milestones. The chart shows the start year of the source school year, not a full opening date.';
  draw('timeline','scatter',[],series,'School index',{scales:{x:{title:{display:true,text:'Source milestone year'},ticks:{precision:0,maxTicksLimit:6,callback:v=>String(v)},grid:{color:'#e6edf5'}},y:{type:'category',labels:rows.map(r=>r.School),offset:true,reverse:true,ticks:{autoSkip:false,callback:v=>rows[v]?wrapLabel(rows[v].School,$('timelinePlot').clientWidth<500?12:24):''},grid:{display:false}}},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${rows[c.parsed.y]?.School} · ${c.dataset.label}: ${c.parsed.x}`}}}}});
  storeTable('timeline','Source partnership milestones',['School','Opened school year','SLU sponsor since','LEA'],rows.map(s=>[s.School,s['Opened school year'],s['SLU sponsor since'],s['DESE LEA']]));
}
function renderCoverage() {
  const rows=records('coverageSchool','coverageLevel');
  const fields=['2025–26 K–12','2025–26 PK','2025 K–12',...Object.keys(names),...($('coverageLevel').value==='Charter'?['MAP ELA P+A %','MAP Math P+A %']:[])];
  const headers=['School / building',...fields];
  $('coverageContext').textContent=`${rows.length} records · Each cell shows its source value or unavailable status. Demographics / MAP: 2025; preliminary enrollment: 2025–26.`;
  $('coverageInsight').textContent='This matrix explains which comparisons are possible. Gray cells mean unavailable or suppressed, not zero. Building MAP results are explored separately in the MAP report.';
  storeTable('coverage','Coverage and source values',headers,rows.map(r=>[r.label,...fields.map(f=>r[f])]));
  $('coverageData').querySelectorAll('tbody td').forEach(td=>{td.classList.add(td.textContent==='Unavailable*'?'missing-cell':'reported-cell');});
  $('coveragePlot').hidden=true;
  legend('coverage',[{label:'Reported source value',color:'#dcebf9'},{label:'Unavailable / suppressed',color:'#e7e9ed'}]);
}
function renderDirectory() {
  let rows=selected('directorySchool',data.schools);
  const text=$('directorySearch').value.trim().toLocaleLowerCase();rows=rows.filter(r=>`${r.School} ${r['DESE LEA']}`.toLocaleLowerCase().includes(text));
  const group=$('directoryFields').value;
  const fields=group==='demographics'?Object.keys(names):group==='assessment'?['MAP ELA P+A %','MAP Math P+A %','ELA reportable','Math reportable']:group==='enrollment'?['2025–26 K–12','2025–26 PK','2025 K–12','DESE buildings']:['Opened school year','SLU sponsor since','DESE buildings','2025–26 K–12','2025–26 PK','2025 K–12',...Object.keys(names),'MAP ELA P+A %','MAP Math P+A %','ELA reportable','Math reportable'];
  const usableFields=fields.filter(f=>rows.some(r=>r[f]!==null&&r[f]!==undefined));
  $('directoryContext').textContent=`${rows.length} of ${data.schools.length} school records match. Enrollment: source years in column headings. Demographics and MAP: 2025. DESE buildings are record counts, not physical campuses.`;
  $('directoryInsight').textContent=rows.length?'Use the column group to focus the directory, or download exactly these filtered values. Source names and identifiers are preserved.':'No schools match this search. Clear the search or reset this report.';
  storeTable('directory','Source: Cohort Master · percentages and MAP are 2025',['School','LEA',...usableFields,'Source row','Missingness note'],rows.map(r=>[r.School,r['DESE LEA'],...usableFields.map(f=>r[f]),r.source_row,reason(r,usableFields)]));
  $('directoryPlot').hidden=true;$('directoryLegend').hidden=true;
}

function download(id) {
  const source=exportsByReport[id],el=$(id+'Panel'),headers=['Level','Year',...source.headers],rows=source.rows.map(r=>[el.dataset.level,el.dataset.year,...r]);
  const cell=v=>{let s=visitorText(v??'Not in supplied source');if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+visitorText(s).replace(/"/g,'""')+'"';};
  const metadata=[['Report',$(id+'Title').textContent],['Filter context',$(id+'Context').textContent],['Generated UTC',data.generated_at],['Level',el.dataset.level],['Year',el.dataset.year],['Missing data',data.missing_data_note]];
  const blob=new Blob(['\uFEFF'+[...metadata,[],headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`oscp-${id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderFrl() {
  const rows=selected('frlSchool',data.demographic_counts).filter(r=>r.level===$('frlLevel').value);
  const field=$('frlMeasure').value,rate=field==='rate';
  const records=rows.map(r=>({...r,value:rate?(valid(r.LUNCH_COUNT_FREE_REDUCED)&&valid(r.JANUARY_MEMBERSHIP)&&r.JANUARY_MEMBERSHIP>0?100*r.LUNCH_COUNT_FREE_REDUCED/r.JANUARY_MEMBERSHIP:null):r.LUNCH_COUNT_FREE_REDUCED}));
  const reportable=records.filter(r=>valid(r.value));
  $('frlContext').textContent=`2025 · ${$('frlLevel').selectedOptions[0].textContent} · ${reportable.length}/${rows.length} records have the selected count/denominator.`;
  $('frlInsight').textContent='FRL uses January membership, not preliminary enrollment. The chart uses count-derived percentages; small differences from one-decimal source rates reflect rounding. Summaries are ratios of sums, never an average of percentages.';
  const old=data.benchmark_subsets.frl;
  reference('frl',officialContext('frl')+`<details><summary>Earlier incomplete extract-based comparison (retained for audit)</summary><p>${fmt(old.value)}% = ${fmt(old.numerator)} / ${fmt(old.denominator)} January membership; ${old.reportable_records}/${old.source_records} usable district rows. Excluded ${old.excluded_missing_or_nonpositive_denominator} missing/nonpositive pairs and ${old.excluded_inconsistent_counts.length} count/membership conflicts. It is not the complete statewide rate.</p></details>`);
  draw('frl','bar',reportable.map(r=>r.name),[{label:rate?'2025 FRL / January membership (%)':'2025 reported FRL count',values:reportable.map(r=>r.value)}],rate?'%':'Reported FRL count');
  storeTable('frl','2025 FRL source counts and compatible membership',['School / building','Reported FRL count','January membership','Count-derived FRL (%)','Source FRL (%)','LEA','Source file','Source row','Missingness note'],records.map(r=>[r.name,r.LUNCH_COUNT_FREE_REDUCED,r.JANUARY_MEMBERSHIP,valid(r.LUNCH_COUNT_FREE_REDUCED)&&r.JANUARY_MEMBERSHIP>0?100*r.LUNCH_COUNT_FREE_REDUCED/r.JANUARY_MEMBERSHIP:null,r.LUNCH_COUNT_FREE_REDUCED_PCT,r.lea,r.source_file,r.source_row,reason(r,['LUNCH_COUNT_FREE_REDUCED','JANUARY_MEMBERSHIP'])]));
}
function renderSchoolList() {
  let rows=selected('schoolListSchool',data.directory);
  if($('schoolListAddress').value==='shared')rows=rows.filter(r=>r.shared_address_with.length);
  const query=$('schoolListSearch').value.trim().toLocaleLowerCase();rows=rows.filter(r=>`${r.name} ${r.lea} ${r.building} ${r.street} ${r.city}`.toLocaleLowerCase().includes(query));
  $('schoolListContext').textContent=`${rows.length} of 14 DESE building identifiers · official directory as of June 30, 2026 · six charter networks. ${data.directory_summary.distinct_normalized_street_addresses} normalized street-address groups; not a verified physical-campus count.`;
  $('schoolListInsight').textContent='Names, codes, directory grades and addresses are checked against the dated DESE directory. Historical 2025 APR grade spans remain separate. Shared street addresses do not merge school records. Network opening years do not establish each building’s opening date; source conflicts are documented in the table.';
  $('schoolListPlot').hidden=true;$('schoolListLegend').hidden=true;
  storeTable('schoolList','Official DESE directory · June 30, 2026 · original undated records preserved',['Individual school / building','Charter network','LEA','Building identifier','Directory grades (2026)','Street','City','Source ZIP','Shared street address with','Network opened (not building)','Directory as of','PDF page','Source URL','Verification / conflict notes'],rows.map(r=>[r.name,data.schools.find(s=>s['DESE LEA']===r.lea).School,r.lea,r.building,r.grades,r.street,r.city,r.zip,r.shared_address_with.join('; ')||'No other cohort identifier at this street address',r.network_opening.opened_school_year,r.as_of,r.source_page,r.source_url,[...r.verification_notes,...r.verified_program_or_facility_history.map(h=>`${h.date}: ${h.scope}. ${h.source_url}`)].join(' ')||'Matched to dated DESE directory; no conflict identified.']));
  reference('schoolList','<strong>Dated source verification</strong><p><a href="'+esc(rows[0]?.source_url??data.directory[0].source_url)+'" target="_blank" rel="noopener">2026 Missouri School Statistics and Directory</a> · directory data as of June 30, 2026. The earlier undated workbook remains untouched; a newer Hope Leadership Academy address is shown.</p>');
}
function renderMatchedMap() {
  const all=selected('matchedSchool',data.matched_map.grade_slices).filter(r=>r.level===$('matchedLevel').value&&r.subject===$('matchedSubject').value);
  options('matchedGroup',[...new Map(all.map(r=>[JSON.stringify([r.category,r.group]),`${r.group} · ${r.category.replace('MSIP ','')}`])).entries()],JSON.stringify(['Total','Total']));
  const group=all.filter(r=>JSON.stringify([r.category,r.group])===$('matchedGroup').value);
  const labels=g=>({'E1':'E1 · English I','E2':'E2 · English II','A1':'A1 · Algebra I','A2':'A2 · Algebra II','B1':'B1 · Biology','G1':'G1 · Government'}[g]??(/^\d+$/.test(g)?`Grade ${g}`:`Course ${g}`));
  options('matchedGrade',[...new Set(group.map(r=>r.grade))].sort().map(g=>[g,labels(g)]),'3');
  const rows=group.filter(r=>r.grade===$('matchedGrade').value),eligible=rows.filter(r=>r.above_state!==null),above=eligible.filter(r=>r.above_state);
  const subject=$('matchedSubject').selectedOptions[0].textContent,grade=$('matchedGrade').selectedOptions[0]?.textContent??'No reportable grade',unit=$('matchedLevel').value==='Building'?'schools':'networks';
  $('matchedMapTitle').textContent=`${grade} ${subject}: ${$('matchedLevel').value==='Building'?'School':'Network'} vs Missouri`;
  $('matchedMapContext').textContent=`2025 · ${$('matchedLevel').selectedOptions[0].textContent} · ${$('matchedSchool').selectedOptions[0].textContent} · ${$('matchedGroup').selectedOptions[0]?.textContent??'No group'} · ${above.length}/${eligible.length} eligible records above Missouri. ${eligible.length}/${rows.length} selected records have the required published counts.`;
  $('matchedMapInsight').innerHTML=eligible.length?`<strong>${above.length} of ${eligible.length} eligible ${unit}</strong> scored above Missouri for ${esc(grade.toLowerCase())} ${esc(subject.toLowerCase())} in the selected student group. ${rows.length-eligible.length} of ${rows.length} selected records cannot be compared because required counts are unavailable. <span class="context">Above Missouri does not mean meeting a school's own official goal.</span>`:'<strong>Comparison unavailable for this selection.</strong> The school and state must both publish Proficient, Advanced and a positive reportable count for the same subject, grade and group. Missing values are not zero. Try another grade or subject.';
  reference('matchedMap',`<strong>Exact-match formula</strong><p>For both school and Missouri: 100 × (published Proficient + Advanced) / Reportable, using the same year, subject, source group and grade/course. No inferred component or unweighted school average. Full-school MSIP classifications remain Unavailable* where grade totals do not reconcile to that different reporting scope.</p>`);
  draw('matchedMap','bar',eligible.map(r=>r.name),[{label:'Sponsored school / network · Proficient or Advanced (%)',values:eligible.map(r=>r.school_pct)},{label:'Missouri · same subject, group and grade (%)',values:eligible.map(r=>r.state_pct),color:'#687887',options:{backgroundColor:'#ffffff',borderWidth:1.5,borderColor:'#687887'}}],'%');
  storeTable('matchedMap','Source-verified 2025 single-grade/course MAP comparison',['School / network','Subject','Group','Grade/course','School P+A count','School reportable','School P+A (%)','State P+A count','State reportable','State P+A (%)','Strictly above state','LEA','Building identifier','School source','School source row','State source','State source row','Unavailable reason'],rows.map(r=>[r.name,r.subject,r.group,r.grade,r.school_numerator,r.school_denominator,r.school_pct,r.state_numerator,r.state_denominator,r.state_pct,r.above_state===null?null:r.above_state?'Yes':'No',r.lea,r.building??'Charter',r.source_file,r.source_row,r.state_source_file,r.state_source_row,r.missingness.comparison?.detail??'All exact-match counts reported']));
}
function renderGrowth() {
  const subject=$('growthSubject').value;
  const base=selected('growthSchool',data.growth).filter(r=>r.subject===subject);
  options('growthGrades',[['all','All source grade spans'],...[...new Set(base.map(r=>r.grade_span))].sort().map(s=>[s,s])],'all');
  const rows=base.filter(r=>$('growthGrades').value==='all'||r.grade_span===$('growthGrades').value);
  const eligible=rows.filter(r=>r.eligible),target=eligible.filter(r=>r.designation==='Target');
  const networks=data.schools.filter(s=>rows.some(r=>r.lea===s['DESE LEA']));
  const values=networks.map(s=>{const selected=eligible.filter(r=>r.lea===s['DESE LEA']);return selected.length?100*selected.filter(r=>r.designation==='Target').length/selected.length:null;});
  const summary=data.benchmarks.growth[subject],state=$('growthGrades').value==='all'?summary:summary.grade_spans[$('growthGrades').value];
  $('growthContext').textContent=`2025 APR · ${subject} · ${target.length}/${eligible.length} eligible selected buildings designated Target · ${rows.length-eligible.length}/${rows.length} selected records unreported/ineligible.`;
  $('growthInsight').textContent='Target is the exact APR designation with full growth points. On-Track does not count as Target. Eligibility requires positive points possible, earned points and designation; Participation records remain eligible. This is a building rate, not a percentage of students growing.';
  reference('growth',`<strong>Missouri eligible-building Target rate: ${fmt(state?.value)}%</strong><p>${state?.numerator??'Unavailable*'} / ${state?.denominator??'Unavailable*'} eligible buildings · same ${esc(subject)} ALL growth indicator, 2025 · ${esc($('growthGrades').selectedOptions[0].textContent)}. ${$('growthGrades').value==='all'?'All-grade-span aggregate; select a grade span for a narrower comparison.':'Only the matching source grade span is included.'}</p>`);
  draw('growth','bar',networks.map(s=>s.School),[{label:`${subject} · eligible buildings designated Target (%)`,values}],'%');
  storeTable('growth','2025 APR building ALL growth measures',['Building','Network','Source grades','Designation','Points earned','Points possible','Points earned (%)','Eligible','LEA','Building identifier','Source row','Missingness note'],rows.map(r=>[r.name,data.schools.find(s=>s['DESE LEA']===r.lea).School,r.grade_span,r.designation,r.earned,r.possible,r.points_pct,r.eligible?'Yes':'No: measure unavailable',r.lea,r.building,r.source_row,reason(r,['possible','earned','designation'])]));
}
function publicBar(label,value,max=100,suffix='%') {
  const available=valid(value),width=available?Math.max(0,Math.min(100,100*value/max)):0;
  return `<div class="html-bar-row"><span class="html-bar-label">${esc(label)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${width}%"></div></div><span class="bar-value ${available?'':'unavailable-value'}">${available?fmt(value)+suffix:'Unavailable*'}</span></div>`;
}
function sourceNote(text,url,label='Official source') {
  return `<p class="source">${esc(text)}${url?` · <a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:''}</p>`;
}
function revealTarget(hash,focus=true) {
  const target=document.querySelector(hash);if(!target)return;
  if(target.tagName==='DETAILS')target.open=true;
  const disclosure=target.closest('.report-disclosure');if(disclosure)disclosure.open=true;
  if(focus&&target.hasAttribute('tabindex'))target.focus({preventScroll:true});
  history.replaceState(null,'',hash);
  requestAnimationFrame(()=>target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
}
function renderKpis() {
  const k=data.kpi_metrics,ela=k.map['Eng. Language Arts'],math=k.map.Mathematics,g=k.growth['Eng. Language Arts'],gm=k.growth.Mathematics;
  const icons=['<path d="M4 20v-2a6 6 0 0 1 12 0v2M16 5a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 4"/><circle cx="10" cy="7" r="4"/>','<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01"/>','<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>','<path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M19 21V3c-5 2-5 9 0 9"/>','<path d="M4 19h16M7 15V9M12 15V5M17 15v-4"/>','<path d="M4 20V4M4 20h16M8 15l4-5 4 2 5-7"/>'];
  const cards=[
    ['students','Students Served',fmt(k.students.value),'Preliminary K–12 enrollment · 2025–26','Excludes preschool and unverified additional partnerships.','students-schools'],
    ['schools','Sponsored Schools',fmt(k.schools.value),'School records across six charter networks','DESE building identifiers · June 30, 2026. Not unique physical campuses.','students-schools'],
    ['demographics','Student Demographics',`${fmt(k.demographics.value)}%`,'Black enrollment · 2025',`${fmt(k.demographics.numerator)} of ${fmt(k.demographics.denominator)} in the 2025 K–12 reporting population.`,'student-demographics'],
    ['frl','Free/Reduced Lunch',fmt(k.frl.numerator),`${fmt(k.frl.value)}% of January membership · 2025`,`${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} reported eligible for free or reduced-price lunch.`,'student-demographics'],
    ['map','MAP Proficiency',`${fmt(ela.value)}% ELA`,`${fmt(math.value)}% Mathematics · 2025`,'Three of six reportable networks per subject. Proficient or Advanced tested students.','academic-performance'],
    ['growth','Academic Growth',`${g.numerator} of ${g.denominator} ELA`,`${gm.numerator} of ${gm.denominator} Mathematics · 2025`,'Eligible buildings receiving the APR Target designation; not a student growth rate.','academic-growth']];
  $('kpis').innerHTML=cards.map(([key,label,value,subtitle,note,target],i)=>`<a class="kpi kpi-link ${i===0?'primary':''}" data-kpi="${key}" href="#${target}"><span class="card-label"><span class="card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</svg></span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(subtitle)}</small><p>${esc(note)}</p><span class="card-action">Explore this story <span aria-hidden="true">↗</span></span></a>`).join('');
  $('missingFootnote').textContent=data.missing_data_note;
}
function renderPublicDirectory() {
  const query=$('publicSchoolSearch').value.trim().toLocaleLowerCase(),lea=$('publicSchoolNetwork').value;
  const rows=data.directory.filter(r=>{const network=data.schools.find(s=>s['DESE LEA']===r.lea).School;return (lea==='all'||r.lea===lea)&&`${r.name} ${network} ${r.street} ${r.city} ${r.lea} ${r.building}`.toLocaleLowerCase().includes(query);});
  $('publicDirectoryContext').textContent=`${rows.length} of ${data.directory.length} verified school records · June 30, 2026`;
  const grades=s=>s.split('-').map(g=>g==='PK'?'Pre-K':g==='KK'?'K':g.replace(/^0([1-9])/,'$1')).join('–');
  $('publicSchoolCards').innerHTML=rows.length?rows.map(r=>{
    const school=data.schools.find(s=>s['DESE LEA']===r.lea);
    return `<article class="school-card"><p class="network-name">${esc(school.School)}</p><h3>${esc(r.name)}</h3><p><b>Grades ${esc(grades(r.grades))}</b><br>${esc(r.street)}<br>${esc(r.city)} · ${esc(r.zip)}</p>${r.shared_address_with.length?'<span class="tag">Shares an address with another school record</span>':''}<p>Network opened ${esc(r.network_opening.opened_school_year)}.<br><small>This is not the building's opening date.</small></p>${r.verified_program_or_facility_history.map(h=>`<p>${esc(h.date)}: ${esc(h.scope)}. <a href="${esc(h.source_url)}" target="_blank" rel="noopener">School history</a></p>`).join('')}<details><summary>School identifiers &amp; sources</summary><p>DESE network ${esc(r.lea)} · building ${esc(r.building)}<br>Directory as of June 30, 2026 · page ${r.source_page}</p><a href="${esc(r.source_url)}" target="_blank" rel="noopener">Official DESE directory</a><p>${esc(r.verification_notes.join(' ')||'Matched to the dated DESE directory.')}</p></details></article>`;
  }).join(''):'<p>No matching schools. Try another name or reset your search.</p>';
}
function renderPublicDemographics() {
  const field=$('publicDemoMetric').value,info={
    'Black %':['Black enrollment','black','Students reported as identifying as Black in the source racial/ethnic category. This is one category, not a complete picture of racial composition.'],
    'FRL %':['Free or reduced-price lunch','frl','Eligibility for free or reduced-price lunch follows the reported January membership population. It is not a direct measure of household income.'],
    'EL %':['English learners','el','Students identified as English learners in the source. Unavailable values do not mean there are no English learners.'],
    'IEP incidence %':['Special education · IEP incidence','iep','IEP means Individualized Education Program. Incidence follows the DESE source definition and is not recalculated from rounded percentages.']
  }[field];
  const metric=field==='Black %'?data.kpi_metrics.demographics:field==='FRL %'?data.kpi_metrics.frl:null;
  const rows=data.schools.map(s=>{const raw=data.demographic_counts.find(r=>r.level==='Charter'&&r.lea===s['DESE LEA']);return {name:s.School,value:metric?100*raw[metric.count_column]/raw[metric.denominator_column]:s[field]};});
  const available=rows.filter(r=>valid(r.value));
  $('demographicsStory').innerHTML=`<p class="story-takeaway">${metric?`<strong>${fmt(metric.value)}%</strong> across the six networks: ${fmt(metric.numerator)} of ${fmt(metric.denominator)} in the applicable 2025 population.`:`<strong>${available.length} of ${rows.length} networks</strong> have a reported ${esc(info[0].toLowerCase())} rate. No combined rate is inferred.`}</p><p class="context">${esc(info[2])}</p><p class="bar-axis">2025 · percent of each network's applicable reporting population · scale 0–100%</p><div class="html-bars">${rows.map(r=>publicBar(r.name,r.value)).join('')}</div><p class="context">Unavailable* means unreported or suppressed, not zero.</p><details><summary>Missouri context &amp; source</summary>${officialContext(info[1])}${sourceNote('Network data: 2025 DESE cohort and district demographic sources. Percentages use their own reporting populations. No percentage-point difference is calculated.')}</details>`;
}
function renderPublicStory() {
  const k=data.kpi_metrics,schools=[...data.schools].sort((a,b)=>b['2025–26 K–12']-a['2025–26 K–12']),max=Math.max(...schools.map(s=>s['2025–26 K–12']));
  $('studentTotal').textContent=fmt(k.students.value);
  $('networkStory').innerHTML=`<div class="network-total"><strong>${fmt(k.students.value)}</strong><p><b>Students across six charter networks</b><br>Preliminary K–12 enrollment · 2025–26</p></div><h3>How many students does each network enroll?</h3><p class="story-takeaway">${esc(schools[0].School)} has the largest reported enrollment, with <strong>${fmt(schools[0]['2025–26 K–12'])}</strong> students. Each bar represents one network; building records are not added again.</p><p class="bar-axis">Students · bar length is relative to the largest network</p><div class="html-bars">${schools.map(s=>publicBar(s.School,s['2025–26 K–12'],max,'')).join('')}</div>${sourceNote('Source: reconciled OSCP DESE Cohort Master, preliminary 2025–26 K–12 enrollment. Preschool and other partnerships are excluded.')}<a class="explorer-link text-link" href="#enrollmentPanel">Explore enrollment periods and school-level detail →</a>`;
  $('frlStory').innerHTML=`<div><div class="feature-number">${Math.round(k.frl.value)}<small>out of every 100 students</small></div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${k.frl.value}%"></div></div></div><div><h3>Understanding lunch eligibility</h3><p>Approximately ${Math.round(k.frl.value)}% in the applicable January membership population were reported as eligible for free or reduced-price lunch. This is an interpretation of <b>${fmt(k.frl.value)}%</b>, not an exact count of 100 students.</p>${sourceNote(`${fmt(k.frl.numerator)} / ${fmt(k.frl.denominator)} January membership · 2025. Missouri published context (${esc(data.benchmarks.frl.year)}): ${fmt(data.benchmarks.frl.value)}%; underlying counts are not printed. Different populations are not directly subtracted.`,data.benchmarks.frl.source_url)}</div>`;
  $('mapStory').innerHTML=[['Eng. Language Arts','English Language Arts'],['Mathematics','Mathematics']].map(([key,label])=>{const m=k.map[key];return `<article class="outcome-card"><p class="eyebrow">2025 / REPORTED ACHIEVEMENT</p><h3>${label}</h3><div class="outcome-value">${fmt(m.value)}%</div><p><b>${fmt(m.numerator)} of ${fmt(m.denominator)} reportable tested students</b> reached Proficient or Advanced.</p><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${m.value}%"></div></div><p class="source">${m.reportable_networks} of ${m.networks} networks have the required published counts. This is not an all-six-network rate.</p></article>`;}).join('');
  $('growthStory').innerHTML=[['Eng. Language Arts','English Language Arts'],['Mathematics','Mathematics']].map(([key,label])=>{const m=k.growth[key],state=data.benchmarks.growth[key];return `<article class="outcome-card"><p class="eyebrow">2025 / APR GROWTH</p><h3>${label}</h3><div class="outcome-value">${m.numerator} <span>of ${m.denominator} eligible buildings</span></div><p>received the APR <b>Target</b> designation.</p><div class="growth-pair"><div class="pair-label"><span>Sponsored buildings · ${m.numerator}/${m.denominator}</span><strong>${fmt(m.value)}%</strong></div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${m.value}%"></div></div><div class="pair-label"><span>Missouri eligible buildings · ${state.numerator}/${state.denominator}</span><strong>${fmt(state.value)}%</strong></div><div class="bar-track" aria-hidden="true"><div class="bar-fill state-fill" style="width:${state.value}%"></div></div></div>${sourceNote('Same 2025 building-level ALL growth indicator. Different grade mixes may affect these descriptive comparisons. DESE APR building supporting workbook.')}</article>`;}).join('');
  options('publicSchoolNetwork',schoolEntries(),'all');renderPublicDirectory();renderPublicDemographics();
}
function setupStoryNavigation() {
  const menu=$('menuToggle'),links=$('navLinks');
  const close=()=>{menu.setAttribute('aria-expanded','false');links.classList.remove('is-open');};
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));links.classList.toggle('is-open',open);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){close();menu.focus();}});
  document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(!link)return;const hash=link.getAttribute('href');if(!document.querySelector(hash))return;event.preventDefault();close();revealTarget(hash);});
  const sections=[...links.querySelectorAll('a')].map(a=>document.querySelector(a.hash));
  let pending=false;
  const update=()=>{pending=false;const y=150;let active=sections[0];sections.forEach(s=>{if(s.getBoundingClientRect().top<=y)active=s;});links.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+active.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});};
  addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update);}},{passive:true});update();
  $('publicDemoMetric').addEventListener('change',renderPublicDemographics);
  $('publicSchoolSearch').addEventListener('input',renderPublicDirectory);$('publicSchoolNetwork').addEventListener('change',renderPublicDirectory);
  $('publicDirectoryReset').addEventListener('click',()=>{$('publicSchoolSearch').value='';$('publicSchoolNetwork').value='all';renderPublicDirectory();});
  const printOpen=[];
  addEventListener('beforeprint',()=>{document.querySelectorAll('details').forEach(d=>{if(!d.open){printOpen.push(d);d.open=true;}});});
  addEventListener('afterprint',()=>{printOpen.splice(0).forEach(d=>d.open=false);});
  if(location.hash&&document.querySelector(location.hash))revealTarget(location.hash,false);
}
const renderers={demographics:renderDemographics,enrollment:renderEnrollment,assessment:renderAssessment,history:renderHistory,timeline:renderTimeline,coverage:renderCoverage,directory:renderDirectory,frl:renderFrl,growth:renderGrowth,schoolList:renderSchoolList,matchedMap:renderMatchedMap};
function initializeLegacy() {
  const metric=control('demoMetric','Student measure',Object.entries(names));
  report('demographics','demographicsMount','Who our schools enroll · 2025','Compare one student characteristic at a time. Percentages describe the source school or building, not a combined average.',schoolControl('demoSchool')+levelControl('demoLevel')+metric+sortControl('demoSort'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort · 2025 demographics.');
  report('timeline','timelineMount','Partnership milestones','See when each school opened and when its SLU sponsorship began.',schoolControl('timelineSchool')+control('timelineEvent','Milestones',[['both','Opening & sponsorship'],['opened','School opening'],['sponsor','SLU sponsorship start']]),'Source: OSCP DESE Cohort Master · Opened school year / SLU sponsor since.');
  report('assessment','assessmentMount','Academic outcomes · MAP 2025','Explore subjects and student groups using the same reporting level. P+A means Proficient + Advanced.',schoolControl('mapSchool')+levelControl('mapLevel')+control('mapGroup','Student group',[])+control('mapMetric','Outcome measure',[])+control('mapSubject','Subject',[]),'Source: supplied 2025 DESE district / school content-area workbooks. Every record matches a sponsored-school LEA and, for building views, a verified cohort building code. Counts and percentages retain source suppression.');
  report('history','historyMount','How school records changed over time','Follow annual enrollment or demographic percentages, with separate lines for each school.',schoolControl('historySchool')+control('historyMetric','Historical measure',[])+control('historyStart','From year',[])+control('historyEnd','To year',[]),'Source: OSCP DESE Cohort Master · Historical Demographics · 2007–2025 (school coverage varies). Historical records do not represent current enrollment.');
  report('coverage','coverageMount','Which values are available?','Check coverage before interpreting a comparison. Every reported value is displayed alongside unavailable fields.',schoolControl('coverageSchool')+levelControl('coverageLevel'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort. No missing data is treated as zero.');
  report('directory','directoryMount','Explore the school directory','Search source school names and identifiers, choose a column group, and download the filtered directory.',schoolControl('directorySchool')+'<div><label for="directorySearch">Search name or LEA</label><input type="search" id="directorySearch" placeholder="School name or code"></div>'+control('directoryFields','Column group',[['all','All available fields'],['enrollment','Enrollment & building records'],['demographics','Demographics · 2025'],['assessment','MAP outcomes · 2025']]),'Source: OSCP DESE Cohort Master · Cohort Master. Unverified location and grade spans are omitted.');
  report('enrollment','enrollmentMount','Enrollment in detail','Compare K–12 or reportable preschool enrollment at the charter or DESE building level. Select one period and measure at a time.',schoolControl('enrollSchool')+levelControl('enrollLevel')+control('enrollMetric','Enrollment & period',Object.entries(enrollmentMetrics))+sortControl('enrollSort'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort. Charter K–12 totals reconcile to building records.');
  report('frl','frlMount','Free/reduced-price lunch · compatible source counts','Reported FRL counts and January membership from the same 2025 source record.',schoolControl('frlSchool')+levelControl('frlLevel')+control('frlMeasure','Measure',[['rate','FRL / January membership (%)'],['count','Reported FRL count']]),'Source: 2025 district / building demographic extracts, Sheet1; LUNCH_COUNT_FREE_REDUCED, JANUARY_MEMBERSHIP and LUNCH_COUNT_FREE_REDUCED_PCT.');
  report('schoolList','schoolListMount','DESE-listed individual schools / buildings','Fourteen distinct identifiers, independently verified against the official directory dated June 30, 2026.',schoolControl('schoolListSchool')+control('schoolListAddress','Street-address sharing',[['all','All building records'],['shared','Records sharing a cohort street address']])+'<div><label for="schoolListSearch">Search school, code or street</label><input type="search" id="schoolListSearch" placeholder="Name, code or street"></div>','Source: official 2026 Missouri School Statistics and Directory · directory as of June 30, 2026. The original undated directory is preserved; source conflicts are explicit.');
  report('matchedMap','matchedMapMount','Matched-grade MAP comparison · 2025','Compare published school/network results to Missouri for exactly the same subject, group and grade or course.',schoolControl('matchedSchool')+levelControl('matchedLevel')+control('matchedSubject','Subject',[['Eng. Language Arts','English Language Arts'],['Mathematics','Mathematics'],['Science','Science'],['Social Studies','Social Studies']])+control('matchedGroup','Source student group',[])+control('matchedGrade','Grade / course',[]),'Source: official 2025 State, District and School Content Area and Grade All and Disag exports, Sheet1. URLs and file hashes are retained in the independent audit; table rows retain exact file and row identifiers.');
  $('matchedLevel').value='Building';
  report('growth','growthMount','APR academic growth · 2025','Share of eligible buildings with the exact APR Target designation, reported separately for ELA and Math.',schoolControl('growthSchool')+control('growthSubject','Subject',[['Eng. Language Arts','ELA'],['Mathematics','Math']])+control('growthGrades','Source grade span',[]),'Source: dese_apr_2025_building_supporting.xlsx, Sheet1; subject ALL_GROWTH_POINTS_POSSIBLE, ALL_GROWTH_POINTS_EARNED and ALL_GROWTH_PERFORMANCE_DESIGNATION. Building totals cross-checked against the APR summary.');
  if($('kpis'))renderKpis();
  Object.entries(renderers).forEach(([id,render])=>{const form=$(id+'Filters');form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('change',render);form.addEventListener('reset',()=>setTimeout(()=>{
    const defaults={demoMetric:'FRL %',enrollMetric:'2025–26 K–12',mapGroup:JSON.stringify(['MSIP Total','Total']),mapMetric:'PA_PCT',mapSubject:'all',historyMetric:'K–12 enrollment',matchedLevel:'Building',matchedGrade:'3',matchedGroup:JSON.stringify(['Total','Total'])};
    Object.entries(defaults).forEach(([key,value])=>{if(form.contains($(key))&&[...$(key).options].some(o=>o.value===value))$(key).value=value;});
    if(id==='history'){$('historyStart').selectedIndex=0;$('historyEnd').selectedIndex=$('historyEnd').options.length-1;}
    render();
  },0));});
  $('directorySearch').addEventListener('input',renderDirectory);
  $('schoolListSearch').addEventListener('input',renderSchoolList);
  document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>download(b.dataset.export)));
  $('resetAll').addEventListener('click',()=>Object.keys(renderers).forEach(id=>$(id+'Filters').reset()));
  $('printReport').addEventListener('click',()=>window.print());
  $('sourceList').style.overflowWrap='anywhere';
  $('sourceList').innerHTML='<ul>'+data.sources.map(s=>`<li><strong>${esc(s.Dataset)}</strong> · ${esc(s['Reporting period'])}<br>${esc(s['Uploaded source filename'])}</li>`).join('')+'</ul>';
  $('sourceList').innerHTML+='<p>Independently verified public references (exact source URLs and SHA-256 hashes)</p><ul>'+data.public_source_verification.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.local_path.split('/').pop())}</a><br>SHA-256: ${esc(s.sha256)}</li>`).join('')+'</ul>';
  table('inventoryTable','All source worksheets inspected; raw workbooks remain local',['Workbook','Worksheet','Nonempty rows'],data.data_inventory.map(s=>[s.file,s.sheet,s.rows]));
  $('definitions').innerHTML=Object.values(data.definitions).map(s=>`<p>${esc(s)}</p>`).join('');
  $('generatedAt').textContent=`Data generated ${new Date(data.generated_at).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC · Reporting periods appear within each report.`;
  $('dashboard').hidden=false;$('loadStatus').hidden=true;$('chartFallback').hidden=Boolean(window.Chart);
  Object.values(renderers).forEach(render=>render());
  if(!window.Chart)document.querySelectorAll('.data-disclosure').forEach(d=>d.open=true);
  if(document.body.dataset.page==='explorer'){setupExplorerShell();DemographicsExplorer.initialize();}else{renderPublicStory();setupStoryNavigation();DemographicsExplorer.initialize();}
}
const DemographicsExplorer=(()=>{
  const defaults=()=>({network:'048914',building:'all',year:2025,measure:'black',sort:'desc',peerLevel:'auto',series:['frl','el','iep'],compare:[]});
  let state=defaults(),records=[],index=new Map(),mounted=false,initialized=false;
  const chartObjects={},raceKeys=['black','hispanic','white','multiracial'];
  const metricColors={black:'#003da5',hispanic:'#007875',white:'#687887',multiracial:'#764e9b',frl:'#003da5',el:'#007875',iep:'#764e9b'};
  const definition=k=>data.demographics_explorer.metrics[k];
  const unitKey=r=>`${r.lea}/${r.building??''}`;
  const networkUnits=()=>data.schools.map(s=>({lea:s['DESE LEA'],building:null,name:s.School,level:'Network'}));
  const buildingUnits=()=>data.directory.map(r=>({lea:r.lea,building:r.building,name:r.name,level:'Building'}));
  function selectedUnits(){return state.building!=='all'?buildingUnits().filter(r=>unitKey(r)===state.building):networkUnits().filter(r=>state.network==='all'||r.lea===state.network);}
  const record=(unit,year)=>index.get(`${unitKey(unit)}/${year}`);
  function summary(units,year,key){
    const rows=units.map(u=>record(u,year)),values=rows.map(r=>r?.metrics[key]),available=values.filter(v=>valid(v?.value));
    const base={year,key,units:units.length,reportable:available.length,numerator:null,denominator:null,value:null,population:definition(key).population};
    if(units.length===1&&available.length===1)return {...base,...available[0]};
    if(!units.length||available.length!==units.length)return {...base,reason:`${available.length} of ${units.length} selected units report this value in ${year??'this year'}. No incomplete total is presented.`};
    if(key==='iep')return {...base,reason:'IEP incidence is a published single-unit rate. Select one network or building; an aggregate denominator is not verified.'};
    if(!values.every(v=>v.aggregatable))return {...base,reason:'Compatible count/denominator pairs are not published for every selected unit. Source percentages are never averaged.'};
    const n=values.reduce((a,v)=>a+v.numerator,0),d=key==='enrollment'?null:values.reduce((a,v)=>a+v.denominator,0);
    return {...base,numerator:n,denominator:d,value:key==='enrollment'?n:100*n/d,method:key==='enrollment'?'sum_of_counts':'ratio_of_sums'};
  }
  function availableYears(){const units=selectedUnits();return data.demographics_explorer.years.filter(y=>units.some(u=>valid(record(u,y)?.metrics[state.measure].value)));}
  function setOptions(id,entries,value){$(id).replaceChildren(...entries.map(([v,label])=>new Option(label,String(v))));$(id).value=String(value);}
  function apply(patch,notice=''){
    const active=document.activeElement,checkboxFocus=active?.type==='checkbox'?{group:active.closest('.dx-series')?.id,value:active.value}:null;
    state={...state,...patch};const messages=notice?[notice]:[];
    if(state.building!=='all'){
      const unit=buildingUnits().find(r=>unitKey(r)===state.building);
      if(patch.network&&unit?.lea!==state.network){state.building='all';messages.push('School selection cleared because it belongs to another network. The view now uses network totals.');}
      else if(unit&&state.network!==unit.lea){state.network=unit.lea;messages.push('Charter network updated to the selected school’s network.');}
    }
    const years=availableYears();
    if(!years.includes(state.year)){
      const old=state.year;state.year=years.at(-1)??null;
      messages.push(state.year===null?'No reportable years exist for this selection.':`Reporting year changed from ${old??'unavailable'} to ${state.year}; the previous year has no published value for this measure and selection.`);
    }
    state.compare=state.compare.filter(lea=>lea!==state.network).slice(0,state.network==='all'?3:2);
    if(state.building!=='all'&&state.compare.length){state.compare=[];messages.push('Extra network trend comparisons cleared to keep the building reporting level separate.');}
    render(messages.join(' '));
    if(checkboxFocus?.group)$(checkboxFocus.group)?.querySelector(`input[value="${CSS.escape(checkboxFocus.value)}"]`)?.focus({preventScroll:true});
  }
  function panel(id,title,question,extra=''){
    return `<article class="dx-panel" aria-labelledby="${id}Heading"><h4 id="${id}Heading">${title}</h4><p class="dx-question">${question}</p>${extra}<p id="${id}Insight" class="dx-insight"></p><div id="${id}Legend" class="legend"></div><div id="${id}Plot" class="dx-plot"><canvas id="${id}Chart" role="img" aria-labelledby="${id}Heading" aria-describedby="${id}Insight"></canvas></div><div id="${id}Fallback" class="dx-chart-alternative" hidden></div></article>`;
  }
  function mount(){
    const metricOptions=Object.entries(data.demographics_explorer.metrics).filter(([k])=>k!=='enrollment').map(([k,m])=>`<option value="${k}">${raceKeys.includes(k)?'Race / ethnicity: ':''}${esc(m.label)}</option>`).join('');
    $('demographicsExplorerMount').innerHTML=`<div class="dx-header"><div><p class="eyebrow">COORDINATED DATA WORKSPACE</p><h3>Student Demographics Explorer</h3><p>Explore student characteristics, school differences, and historical trends across SLU-sponsored charter networks.</p></div><span id="dxPeriod" class="tag"></span></div><form id="dxFilters" class="dx-filters"><div><label for="dxNetwork">Charter network</label><select id="dxNetwork"></select></div><div><label for="dxBuilding">School / building</label><select id="dxBuilding"></select></div><div><label for="dxYear">Reporting year</label><select id="dxYear"></select></div><div><label for="dxMeasure">Demographic measure</label><select id="dxMeasure">${metricOptions}</select></div><button id="dxReset" type="button">Reset all filters</button></form><p id="dxNotice" class="notice" role="status" hidden></p><p id="dxActive" class="dx-active" aria-live="polite"></p><div id="dxKpis" class="dx-kpis" aria-label="Demographic measures for the selected population"></div><div class="dx-grid">${panel('dxRace','Reported racial / ethnic categories','What does our student population look like?')}${panel('dxNeeds','Student characteristics over time','How have student needs changed over time?','<div id="dxSeries" class="dx-series" role="group" aria-label="Visible historical measures"></div>')}${panel('dxEnrollment','Historical K–12 enrollment','How has enrollment changed?','<details class="dx-comparison-options"><summary>Compare network trends</summary><p id="dxCompareHelp">Choose up to two additional networks. Building and network levels are kept separate.</p><div id="dxCompareOptions" class="dx-series"></div></details>')}${panel('dxSchools','Compare schools and networks','How do sponsored schools differ?',`<div class="dx-sort"><div><label for="dxPeerLevel">Compare reporting level</label><select id="dxPeerLevel"><option value="auto">Automatic</option><option value="Building">School/building records</option><option value="Network">Charter networks</option></select></div><div><label for="dxSort">Sort comparison</label><select id="dxSort"><option value="desc">Highest to lowest</option><option value="name">Alphabetical</option></select></div></div><p class="source">Select a chart bar or use its selection button below to filter the workspace.</p>`)}${panel('dxState','Missouri state context','How does this compare with Missouri?')}<div class="dx-peer-actions"><p class="source">Keyboard-accessible school / network selections</p><div id="dxPeerButtons"></div></div></div><details id="dxDetails" class="dx-data"><summary>View detailed data &amp; source records</summary><button id="dxExport" type="button">Download filtered CSV</button><p class="source">Table and CSV include selected-unit history through the reporting year, current-year peer comparisons and optional enrollment comparison history. The “Used in” field distinguishes these populations. CSV retains source counts, published percentages, full-precision derived rates and missingness reasons.</p><div id="dxData" class="scroll" tabindex="0" role="region" aria-label="Filtered demographic source records"></div></details><details class="dx-method"><summary>Metric definitions, source information &amp; limitations</summary><dl>${Object.entries(data.demographics_explorer.metrics).map(([k,m])=>`<dt>${esc(m.label)}</dt><dd>${esc(m.population)}</dd>`).join('')}</dl><p>FRL means free/reduced-price lunch. EL means English learners. IEP means Individualized Education Program. These measures have different populations and are not added together.</p><p>${esc(data.demographics_explorer.rules.aggregate)}</p><p>${esc(data.demographics_explorer.rules.history)}</p><p>${esc(data.demographics_explorer.rules.period)}</p><p>Race bars are four independently reported categories, not an exhaustive distribution. Source * is suppression with no inferred cause; blank/NULL is unreported. Missing values remain unavailable, never zero.</p><p>Sources: DESE district demographics 1991–2025 and building demographics 2006–2025, Sheet1. Only the six current cohort network identifiers and 14 verified building identifiers are included. Exact filenames, names and rows are retained in the data and export. Current directory names label historical identifiers; source-era names are preserved in CSV. No attendance metrics are available.</p><p id="dxStateSource"></p></details>`;
    $('dxFilters').addEventListener('submit',e=>e.preventDefault());
    [['dxNetwork','network'],['dxBuilding','building'],['dxMeasure','measure'],['dxYear','year'],['dxSort','sort'],['dxPeerLevel','peerLevel']].forEach(([id,key])=>$(id).addEventListener('change',()=>apply({[key]:key==='year'?Number($(id).value):$(id).value})));
    $('dxReset').addEventListener('click',()=>{state=defaults();apply({},'Explorer filters reset. Other dashboard reports are unchanged.');});
    $('dxExport').addEventListener('click',exportCsv);mounted=true;
  }
  function enrollmentUnits(){
    if(state.building!=='all')return selectedUnits();
    const networks=networkUnits();
    if(state.network!=='all')return networks.filter(n=>n.lea===state.network||state.compare.includes(n.lea));
    if(state.compare.length)return networks.filter(n=>state.compare.includes(n.lea));
    return [...networks].sort((a,b)=>(record(b,state.year)?.metrics.enrollment.value??-1)-(record(a,state.year)?.metrics.enrollment.value??-1)).slice(0,3);
  }
  function peers(){const level=state.peerLevel==='auto'?(state.network==='all'?'Network':'Building'):state.peerLevel;return (level==='Network'?networkUnits():buildingUnits()).filter(r=>state.network==='all'||r.lea===state.network);}
  function historyYears(units){const years=records.filter(r=>r.year<=state.year&&units.some(u=>unitKey(u)===unitKey(r))).map(r=>r.year);return years.length?Array.from({length:Math.max(...years)-Math.min(...years)+1},(_,i)=>Math.min(...years)+i):[];}
  function sourceDetail(units,year,key){
    const rows=units.map(u=>record(u,year)).filter(Boolean),m=summary(units,year,key);
    return `${m.population}; ${year}; ${m.denominator!==null?`${m.numerator??'unavailable'} / ${m.denominator}; `:''}${[...new Set(rows.map(r=>r.source_file))].join(', ')}, Sheet1 rows ${rows.map(r=>r.source_row).join(', ')||'unavailable'}`;
  }
  function drawChart(id,type,labels,series,percent=true,onClick=null){
    if(chartObjects[id]){chartObjects[id].destroy();delete chartObjects[id];}
    const reported=series.some(s=>s.values.some(valid));
    $(id+'Plot').hidden=!window.Chart||!reported;
    $(id+'Fallback').hidden=Boolean(window.Chart)&&reported;
    $(id+'Legend').innerHTML=series.map(s=>`<span><b style="background:${s.color};${s.outline?'background:#fff;border:2px solid '+s.color:''}"></b>${esc(s.label)}${s.dash?.length?(s.dash[0]===2?' · dotted line':' · dashed line'):''}</span>`).join('');
    $(id+'Fallback').innerHTML=reported?`<ul>${labels.map((label,i)=>`<li><b>${esc(label)}</b>: ${series.map(s=>`${esc(s.label)} ${valid(s.values[i])?fmt(s.values[i])+(percent?'%':''):'Unavailable*'}`).join(' · ')}</li>`).join('')}</ul>`:'<p>No reportable values for this selection. Missing data is not zero.</p>';
    if(!window.Chart||!reported)return;
    const horizontal=type==='bar';
    $(id+'Plot').style.height=horizontal?`${Math.max(240,labels.length*(series.length>1?85:64)+55)}px`:'300px';
    const valueLabels={id:'dxValues',afterDatasetsDraw(c){if(!horizontal)return;const ctx=c.ctx;ctx.save();ctx.font='12px system-ui';ctx.fillStyle='#182e43';c.data.datasets.forEach((set,i)=>c.getDatasetMeta(i).data.forEach((bar,j)=>{if(valid(set.data[j]))ctx.fillText(fmt(set.data[j])+(percent?'%':''),bar.x+5,bar.y+4);}));ctx.restore();}};
    chartObjects[id]=new Chart($(id+'Chart'),{type,data:{labels,datasets:series.map((s,i)=>({label:s.label,data:s.values,borderColor:s.color,backgroundColor:s.barColors??(s.outline?'#fff':s.color),borderWidth:horizontal?(s.outline?2:0):2,borderDash:s.dash??[],pointStyle:['circle','rect','triangle','rectRot'][i%4],pointRadius:3,spanGaps:false,maxBarThickness:20,borderRadius:2}))},plugins:[valueLabels],options:{animation:false,responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',layout:{padding:{right:horizontal?62:12}},onClick:onClick?(_,elements)=>{if(elements.length){const selectedIndex=elements[0].index;requestAnimationFrame(()=>onClick(selectedIndex));}}:undefined,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(horizontal?ctx.parsed.x:ctx.parsed.y)}${percent?'%':''}`,afterLabel:ctx=>series[ctx.datasetIndex].details?.[ctx.dataIndex]??''}}},scales:horizontal?{x:{beginAtZero:true,...(percent?{max:100}:{}),grid:{color:'#e7edf3'},ticks:{font:{size:10}}},y:{grid:{display:false},ticks:{autoSkip:false,font:{size:11},callback:function(v){return wrapLabel(this.getLabelForValue(v),this.chart.width<440?14:24);}}}}:{x:{grid:{display:false},ticks:{maxTicksLimit:6,font:{size:10}}},y:{beginAtZero:true,...(percent?{max:100}:{}),title:{display:true,text:percent?'Percent (%)':'K–12 students'},ticks:{font:{size:10}}}}}});
  }
  function kpiHtml(key){
    const m=summary(selectedUnits(),state.year,key),count=key==='enrollment';
    const source=m.value===null?m.reason:m.denominator!==null?`${fmt(m.numerator)} / ${fmt(m.denominator)} · ${m.population}`:m.population;
    return `<article class="dx-kpi" data-dx-kpi="${key}">${chips(state.building==='all'?'School':'Building',state.year??'Year unavailable')}<span>${esc(definition(key).label)}</span><strong>${valid(m.value)?fmt(m.value)+(count?'':'%'):Object.values(m.missingness??{}).some(v=>v.reason==='suppressed_in_source')?'Withheld by DESE':'Not in supplied source'}</strong><small>${state.year??'No reportable year'} · ${esc(source)}</small></article>`;
  }
  function render(notice=''){
    if(!mounted)return;
    const units=selectedUnits(),years=availableYears(),label=state.building!=='all'?units[0]?.name:state.network==='all'?'All six charter networks':units[0]?.name;
    setOptions('dxNetwork',schoolEntries(),state.network);
    setOptions('dxBuilding',[['all','All (use network totals)'],...buildingUnits().filter(r=>state.network==='all'||r.lea===state.network).map(r=>[unitKey(r),r.name])],state.building);
    setOptions('dxYear',years.length?years.map(y=>[y,y]):[['','No reportable years']],state.year??'');$('dxYear').disabled=!years.length;
    $('dxMeasure').value=state.measure;$('dxSort').value=state.sort;$('dxPeerLevel').value=state.peerLevel;
    $('dxPeriod').textContent=state.year?`Historical data · ${state.year}`:'No reportable year';
    $('dxNotice').textContent=notice;$('dxNotice').hidden=!notice;
    $('dxActive').textContent=`${label??'No population'} · ${state.building==='all'?'Network level':'Building level'} · ${state.year??'Unavailable year'} · ${definition(state.measure).label}. Trend charts end at this year; peer comparisons use this year only.`;
    $('dxKpis').innerHTML=Object.keys(data.demographics_explorer.metrics).map(kpiHtml).join('');
    const race=raceKeys.map(k=>summary(units,state.year,k));
    $('dxRaceInsight').textContent=`${race.filter(m=>valid(m.value)).length} of 4 selected categories are reportable for ${label}, ${state.year??'no reportable year'}. These are independent, incomplete category bars—not a complete distribution. No remainder is inferred.`;
    drawChart('dxRace','bar',raceKeys.map(k=>definition(k).label),[{label:'Independently reported category (%)',color:'#003da5',barColors:raceKeys.map(k=>metricColors[k]),values:race.map(m=>m.value),details:raceKeys.map(k=>sourceDetail(units,state.year,k))}],true);
    $('dxRaceLegend').innerHTML=raceKeys.map(k=>`<span><b style="background:${metricColors[k]}"></b>${esc(definition(k).label)}</span>`).join('');
    const histYears=historyYears(units);
    $('dxSeries').innerHTML=['frl','el','iep'].map(k=>`<label><input type="checkbox" value="${k}" ${state.series.includes(k)?'checked':''}>${esc(definition(k).label)}</label>`).join('');
    $('dxSeries').querySelectorAll('input').forEach(n=>n.addEventListener('change',()=>apply({series:[...$('dxSeries').querySelectorAll('input:checked')].map(i=>i.value)})));
    const needs=state.series.map((k,i)=>({label:definition(k).label,color:metricColors[k],dash:{frl:[],el:[7,4],iep:[2,4]}[k],values:histYears.map(y=>summary(units,y,k).value),details:histYears.map(y=>sourceDetail(units,y,k))}));
    $('dxNeedsInsight').textContent=`${label}: ${histYears[0]??'—'}–${histYears.at(-1)??'—'}. Only published/compatible values are plotted. Gaps remain disconnected. FRL uses January membership; EL uses K–12 enrollment; IEP is a published incidence rate. Historical definitions may vary. ${units.length>1?'IEP has no verified combined denominator; select one network or school for that line.':''}`;
    if(!state.series.length)$('dxNeedsInsight').textContent='No historical measure is selected. Use the labelled checkboxes to show FRL, English learners or IEP incidence. Source data has not been removed.';
    drawChart('dxNeeds','line',histYears.map(String),needs);
    const trendUnits=enrollmentUnits(),enrollYears=historyYears(trendUnits);
    $('dxCompareOptions').innerHTML=networkUnits().filter(n=>n.lea!==state.network).map(n=>`<label><input type="checkbox" value="${n.lea}" ${state.compare.includes(n.lea)?'checked':''} ${state.building!=='all'?'disabled':''}>${esc(n.name)}</label>`).join('');
    $('dxCompareHelp').textContent=state.building!=='all'?'Network comparisons are disabled for a building-level view.':state.network==='all'?'Showing up to three network lines. Select up to three networks to compare; no lines are summed.':'Choose up to two additional networks; no building totals are added.';
    $('dxCompareOptions').querySelectorAll('input').forEach(n=>n.addEventListener('change',()=>{const chosen=[...$('dxCompareOptions').querySelectorAll('input:checked')].map(i=>i.value),limit=state.network==='all'?3:2;if(chosen.length>limit){n.checked=false;$('dxNotice').hidden=false;$('dxNotice').textContent=`Choose at most ${limit} comparison networks to keep labels readable.`;return;}apply({compare:chosen});}));
    $('dxEnrollmentInsight').textContent=`${trendUnits.length} ${state.building==='all'?'network':'building'} historical series, ${enrollYears[0]??'—'}–${enrollYears.at(-1)??'—'}. Each line keeps its own identifier. Missing years are gaps; preliminary 2025–26 enrollment is excluded. Changes may reflect enrollment and reporting changes; no causal interpretation is inferred.`;
    drawChart('dxEnrollment','line',enrollYears.map(String),trendUnits.map((u,i)=>({label:u.name,color:colors[i],dash:[[],[7,4],[2,3]][i],values:enrollYears.map(y=>record(u,y)?.metrics.enrollment.value??null),details:enrollYears.map(y=>sourceDetail([u],y,'enrollment'))})),false);
    const peerUnits=peers(),ranked=peerUnits.map(u=>({unit:u,m:summary([u],state.year,state.measure)})).sort((a,b)=>state.sort==='name'?a.unit.name.localeCompare(b.unit.name):(b.m.value??-1)-(a.m.value??-1)),reportable=ranked.filter(r=>valid(r.m.value));
    $('dxSchoolsInsight').textContent=`${reportable.length} of ${ranked.length} current-cohort ${peerUnits[0]?.level==='Network'?'networks':'school records'} report ${definition(state.measure).label.toLowerCase()} in ${state.year??'this year'}. ${state.building!=='all'?'Sibling schools remain visible as same-year peer context; other panels use the selected school.':'Click or choose a record to focus the workspace.'} Missing rates are excluded, not plotted at zero.`;
    drawChart('dxSchools','bar',reportable.map(r=>r.unit.name),[{label:definition(state.measure).label+' (%)',color:'#003da5',values:reportable.map(r=>r.m.value),details:reportable.map(r=>`${r.m.population}; ${state.year}; ${record(r.unit,state.year).source_file}, row ${record(r.unit,state.year).source_row}`)}],true,i=>selectPeer(reportable[i].unit));
    $('dxPeerButtons').innerHTML=ranked.map((r,i)=>`<button type="button" data-peer="${i}" ${state.building===unitKey(r.unit)?'aria-pressed="true"':'aria-pressed="false"'}>${esc(r.unit.name)} <span>${valid(r.m.value)?fmt(r.m.value)+'%':'Unavailable*'}</span></button>`).join('');
    $('dxPeerButtons').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>selectPeer(ranked[Number(b.dataset.peer)].unit)));
    renderState(units);renderData();installDXExports();
    if(!window.Chart){$('dxDetails').open=true;$('dxNotice').hidden=false;$('dxNotice').textContent=(notice?notice+' ':'')+'Chart library unavailable. Chart alternatives and the detailed data remain available; filters and CSV still work.';}
  }
  function selectPeer(unit){apply(unit.building?{network:unit.lea,building:unitKey(unit)}:{network:unit.lea,building:'all'},`${unit.name} selected from the peer comparison. All applicable panels updated.`);}
  function renderState(units){
    const metric=summary(units,state.year,state.measure),b=state.year===2025?data.benchmarks[state.measure]:null;
    const validState=valid(b?.value);
    $('dxStateInsight').textContent=validState?`Missouri published context: ${fmt(b.value)}% (${b.year}). ${b.population} Selected population: ${state.year}. This is contextual, not a directly matched comparison; no percentage-point difference is calculated. ${valid(metric.value)?'':'The selected combined rate is unavailable; only the published state context is shown.'}`:'Missouri comparison unavailable for this measure and reporting period.';
    drawChart('dxState','bar',['Selected population','Missouri context'],validState?[{label:`Selected · ${state.year}`,color:'#003da5',values:[metric.value,null],details:[metric.population,'']},{label:`Missouri · ${b.year}`,color:'#687887',outline:true,values:[null,b.value],details:['',b.population]}]:[]);
    $('dxStateSource').innerHTML=validState?`<a href="${esc(b.source_url)}" target="_blank" rel="noopener">Official Missouri source · ${esc(b.year)}${b.source_page?' · page '+b.source_page:''}</a>. Published rounded values; underlying missing counts are not reconstructed.`:'No official historical statewide benchmark is carried forward into this selected year.';
  }
  function exportRows(){
    const selected=new Set(selectedUnits().map(unitKey)),peer=new Set(peers().map(unitKey)),enrollment=new Set(enrollmentUnits().map(unitKey));
    return records.filter(r=>r.year<=state.year&&(selected.has(unitKey(r))||r.year===state.year&&peer.has(unitKey(r))||enrollment.has(unitKey(r)))).map(r=>({...r,used_in:[selected.has(unitKey(r))?'Selected population history':'',r.year===state.year&&peer.has(unitKey(r))?'Current-year peers':'',enrollment.has(unitKey(r))?'Enrollment trends':''].filter(Boolean).join('; ')}));
  }
  function renderData(){
    const rows=exportRows(),keys=Object.keys(data.demographics_explorer.metrics);
    table('dxData',`Filtered records through ${state.year??'unavailable year'} · levels and populations stay separate`,['Name','Level','Year',...keys.map(k=>definition(k).label+(k==='enrollment'?'':' (%)')),'Source file','Source row','Used in'],rows.map(r=>[r.name,r.level,String(r.year),...keys.map(k=>r.metrics[k].value),r.source_file,r.source_row,r.used_in]));
  }
  function exportCsv(){
    const rows=exportRows(),keys=Object.keys(data.demographics_explorer.metrics),cell=v=>{let s=visitorText(v??'Not in supplied source');if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+visitorText(s).replace(/"/g,'""')+'"';};
    const metadata=[['Student Demographics Explorer'],['Shared filters',JSON.stringify(state)],['Data rules',data.demographics_explorer.rules.aggregate],['History scope','Through selected year; current-year peers and optional enrollment comparison histories are separately labelled.'],[]];
    const header=['Name','Source-era name','Level','Year','Network ID','Building ID','Metric','Value','Numerator','Denominator','Published percentage','Method','Population','Missingness / limitation','Source file','Source sheet','Source row','Used in'];
    const values=rows.flatMap(r=>keys.map(k=>{const m=r.metrics[k];return [r.name,r.source_name,r.level,r.year,r.lea,r.building??'Network',definition(k).label,m.value,m.numerator,m.denominator,m.published_pct,m.method,m.population,[m.reason,...Object.values(m.missingness).map(v=>`${v.reason}: ${v.detail}`)].filter(Boolean).join(' '),r.source_file,r.source_sheet,r.source_row,r.used_in];}));
    const blob=new Blob(['\uFEFF'+[...metadata,header,...values].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`oscp-demographics-${state.year??'unavailable'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function initialize(){
    records=data.demographics_explorer.records;index=new Map(records.map(r=>[`${unitKey(r)}/${r.year}`,r]));
    $('demographicsExplorer').addEventListener('toggle',()=>{if(!$('demographicsExplorer').open)return;if(!mounted)mount();if(!initialized){initialized=true;apply();}else Object.values(chartObjects).forEach(c=>c.resize());});
    if($('demographicsExplorer').open){mount();initialized=true;apply();}
  }
  return {initialize,apply,summary,selectedUnits,exportRows,get state(){return structuredClone(state);},get chartObjects(){return chartObjects;}};
})();
const DISPLAY_STATUS={reported:'Reported',withheld:'Withheld by DESE',not_applicable:'Not applicable',not_supplied:'Not in supplied source',pending:'Awaiting confirmation'};
if(window.Chart)Chart.register({id:'sluJoinMarkers',afterDraw(chart){
  if(chart.config.type!=='line'||!data?.schools)return;
  const years=chart.data.labels.map(Number),ctx=chart.ctx,shown=new Set();
  chart.data.datasets.forEach((series,i)=>{
    const building=data.directory?.find(b=>b.name===series.label),school=data.schools.find(s=>s.School===series.label||building?.lea===s['DESE LEA']);
    const year=school?.['SLU sponsor since'],index=years.indexOf(year);if(index<0||shown.has(year))return;shown.add(year);
    const x=chart.scales.x.getPixelForValue(index);ctx.save();ctx.strokeStyle='#85651d';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,chart.chartArea.top);ctx.lineTo(x,chart.chartArea.bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#674c16';ctx.font='11px sans-serif';ctx.fillText('SLU joined '+year,Math.min(x+4,chart.chartArea.right-100),chart.chartArea.top+14+i*14);ctx.restore();
  });
}});
function tableMissing(id,headers,row,i){
  const name=String(row[0]??''),all=[...(data?.schools??[]),...(data?.buildings??[])];
  const unit=all.find(s=>name.startsWith(s.School)&&!s['Building name']||s['Building name']&&name.startsWith(s['Building name']));
  if(id.startsWith('assessment')){const group=$('mapGroup')?.value,level=$('mapLevel')?.value;const match=data.assessments?.find(a=>a.name===name&&a.subject===row[1]&&a.level===level&&JSON.stringify([a.category,a.group])===group);if(match?.status==='withheld'||Object.values(match?.missingness??{}).some(v=>v.reason==='suppressed_in_source'))return DISPLAY_STATUS.withheld;}
  if(id.startsWith('growth')&&name.includes('Ecec'))return DISPLAY_STATUS.not_applicable;
  const label=headers[i],field=Object.keys(names).find(k=>label.includes(names[k]));return DISPLAY_STATUS[unit?.statuses?.[field]??'not_supplied'];
}
function updateReportMetadata(id){
  const el=$(id+'Panel');if(!el)return;
  const levelControl=el.querySelector('select[id$=Level]');el.dataset.level=levelControl?(levelControl.value==='Building'?'Building':'School'):['growth','schoolList'].includes(id)?'Building':'School';
  el.dataset.year=id==='history'?`${$('historyStart').value}–${$('historyEnd').value}`:id==='enrollment'?($('enrollMetric').value.includes('26')?'2025–26 prelim':'2025'):id==='schoolList'?'Directory Jun 2026':id==='timeline'?'Source milestone years':'2025';
  const measures={demographics:$('demoMetric')?.selectedOptions[0]?.textContent,frl:'Free or reduced-price lunch',assessment:'MAP outcomes',enrollment:'Students enrolled',history:'Historical enrollment and demographics',timeline:'Opening dates and SLU join years',schoolList:'Directory',directory:'School profiles',growth:'APR growth Target',coverage:'Source coverage',matchedMap:`${$('matchedGrade')?.selectedOptions[0]?.textContent??''} ${$('matchedSubject')?.selectedOptions[0]?.textContent??''} proficiency`};
  if($(id+'Title'))$(id+'Title').textContent=`${visitorText(measures[id]??'Measure')} by ${el.dataset.level}, ${el.dataset.year}`;
  const cap=el.querySelector('.caption');if(cap)cap.innerHTML=caption(el.dataset.level,el.dataset.year,el.querySelector('.source')?.textContent??'Source rows in table',$(id+'Context')?.textContent??'Selected records');
}
let globalLevel='School';
function chips(level,year){return `<span class="level-chip" data-level-chip="${esc(level)}">${esc(level.toUpperCase())}</span> <span class="year-chip" data-year="${esc(year)}">${esc(year)}</span>`;}
function caption(level,year,source,coverage){return `${chips(level,year)} · Source: ${esc(source)} · Coverage: ${esc(coverage)}`;}
function cellValue(value,status='not_supplied',suffix=''){return valid(value)?fmt(value)+suffix:DISPLAY_STATUS[status]??DISPLAY_STATUS.not_supplied;}
function visual(id,title,body,level,year,source,coverage){return `<article id="${id}" class="research-visual" data-visual data-level="${level}" data-year="${year}"><div class="chart-heading"><h3>${esc(title)}</h3><div class="export-controls"><button data-visual-csv="${id}">Download CSV</button><button data-visual-png="${id}">Download PNG</button></div></div>${body}<p class="caption">${caption(level,year,source,coverage)}</p></article>`;}
function plainTable(headers,rows){return `<div class="scroll"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<${i?'td':'th scope="row"'}>${v??DISPLAY_STATUS.not_supplied}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function tile(title,value,detail,level,year){return `<article class="kpi kpi-link">${chips(level,year)}<span class="card-label">${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;}
function measureLabel(value){return String(value??'').replace(/_/g,' ');}
function renderMain(){
  const d=data.three_levels,k=data.kpi_metrics;
  $('fiveThings').innerHTML=visual('fiveFacts','Five things to know',`<ol class="facts"><li>${chips('School','2025–26 prelim')} ${fmt(k.students.value)} students are enrolled in six sponsored Schools.</li><li>${chips('Building','Directory Jun 2026')} ${data.directory_summary.building_identifiers} Buildings use ${data.directory_summary.distinct_normalized_street_addresses} street addresses (two address-sharing pairs).</li><li>${chips('School','2025')} ${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} students on the January roster were eligible for free/reduced-price lunch (${fmt(k.frl.value)}%).</li><li>${chips('School','2025')} Three of six Schools have reportable combined Missouri Assessment Program (MAP) proficiency counts.</li><li>${chips('Building','2025')} ${k.growth['Eng. Language Arts'].numerator} of 13 eligible Buildings met the English language arts (ELA) growth Target; ${k.growth.Mathematics.numerator} of 13 met the math Target.</li></ol>`,'School','2025 / 2025–26 prelim','Cohort master; DESE demographics, MAP and APR','six Schools / 14 Buildings');
  const groups=[['Schools',[tile('Sponsored Schools','6','Six sponsored charter Schools','School','Directory Jun 2026'),tile('Buildings','14','14 Buildings at 12 street addresses; physical campus confirmation pending','Building','Directory Jun 2026')]],['Students',[tile('Students enrolled in sponsored schools',fmt(k.students.value),'K–12; six Schools; excludes reported PK','School','2025–26 prelim'),tile('Free/reduced lunch',fmt(k.frl.numerator),`${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} students on the January 2025 roster (${fmt(k.frl.value)}%)`,'School',2025)]],['Learning',[tile('MAP English language arts',fmt(k.map['Eng. Language Arts'].value)+'%',`823 of 1,753 reportable tests; three Schools`,'School',2025),tile('MAP mathematics',fmt(k.map.Mathematics.value)+'%','877 of 1,765 reportable tests; three Schools','School',2025)]],['OSCP programs',[tile('Scholarships',d.inputs.scholarship_totals.count===null?'Awaiting confirmation':fmt(d.inputs.scholarship_totals.count),'Candi · 20 proposed, not yet confirmed','School','2026–27 proposed'),tile('Total reach',d.inputs.total_reach.value===null?d.inputs.total_reach.label:fmt(d.inputs.total_reach.value),'Ryan · separate from students enrolled','School','Reporting period pending')]]];
  $('objectiveKpis').innerHTML=groups.map(([name,tiles],i)=>visual('objective'+i,name,`<div class="two-up">${tiles.join('')}</div>`,'School',i===3?'Awaiting confirmation':'2025 / 2025–26 prelim','DESE source files / confirmed inputs',i===3?'Confirmation pending':'Denominators shown per tile')).join('');
  $('overviewCaption').innerHTML=caption('School','2025 / 2025–26 prelim','Master and raw DESE records','6 Schools; measures have separate populations');
  $('schoolsTakeaway').textContent=`Six Schools use ${data.directory_summary.building_identifiers} Buildings at ${data.directory_summary.distinct_normalized_street_addresses} street addresses (two address-sharing pairs). Physical campus count awaiting Candi.`;
  $('schoolProfiles').innerHTML=data.schools.map(s=>{const p=d.profiles.find(p=>p.lea===s['DESE LEA']),campus=d.inputs.campus_counts.confirmed.find(r=>r.school===s.School);return visual('profile'+p.lea,s.School,`<dl class="profile-facts"><dt>City</dt><dd>${esc(p.city)}</dd><dt>Opened</dt><dd>${esc(s['Opened school year'])}</dd><dt>Joined SLU</dt><dd>${p.joined}; ${p.years_with_slu_as_of_2025} years as of 2025 data</dd><dt>Grades served</dt><dd>${esc(p.grades.join(', '))}</dd><dt>Buildings</dt><dd>${p.building_count}</dd><dt>Students enrolled, K–12 prelim</dt><dd>${fmt(s['2025–26 K–12'])}</dd><dt>Free/reduced lunch, 2025</dt><dd>${cellValue(s['FRL %'],s.statuses['FRL %'],'%')}</dd><dt>Physical campuses</dt><dd>${campus?fmt(campus.physical_campuses)+' (confirmed '+esc(campus.confirmed_date)+')':'Awaiting confirmation; Candi'}</dd><dt>MAP availability</dt><dd>${DISPLAY_STATUS[s.statuses['MAP ELA P+A %']]}</dd></dl>`,'School','2025 / 2025–26 prelim','Cohort Master; dated directory','1 of 6 Schools');}).join('');
  $('citySplit').innerHTML=visual('cities','School and Building locations, 2025–26 preliminary',plainTable(['City','Schools','Buildings','K–12 enrolled'],d.cities.map(c=>[esc(c.city),c.schools,c.buildings,fmt(c.enrollment)])),'School','2025–26 prelim','Cohort Master and directory','6 Schools / 14 Buildings');
  $('buildingDirectory').innerHTML=plainTable(['School','Building','Grades','Address','Shared address','Level / year'],data.directory.map(b=>[esc(data.schools.find(s=>s['DESE LEA']===b.lea).School),esc(b.name),esc(b.grades),esc(b.street+', '+b.city),b.shared_address_with.length?'Shared-address pair':'No cohort address sharing',chips('Building','Directory Jun 2026')]));
  $('schoolsCaption').innerHTML=caption('Building','Directory Jun 2026','2026 Missouri School Statistics and Directory','14 verified identifiers; physical campus count pending');
  const bridge=d.bridge;
  $('studentsTakeaway').textContent=`${fmt(bridge.k12)} students enrolled, K–12, 2025–26 preliminary. Adding ${bridge.reported_pk} reported PK gives ${fmt(bridge.pk12_as_reported)} PK–12 as reported; The Biome PK is not in the supplied source.`;
  $('enrollmentBridge').innerHTML=visual('bridge','Enrollment populations by School, 2025–26 preliminary',plainTable(['Population','Count','Used for'],[['K–12 preliminary',fmt(bridge.k12),'Enrollment headline'],['Plus reported preschool (PK)',fmt(bridge.reported_pk),'18 + 93 + 58 + 15 + 13; Biome not supplied'],['PK–12 as reported',fmt(bridge.pk12_as_reported),'Not a complete verified PK–12 census'],['K–12, 2025',fmt(bridge.race_population),'Race percentages'],['January membership, 2025',fmt(bridge.january_membership),'Lunch percentages']]),'School','2025 / 2025–26 prelim','Cohort Master; district demographics','Raw preliminary enrollment files missing; Harshil');
  $('compositionSchool').innerHTML='<option value="all">All six Schools</option>'+data.schools.map(s=>`<option value="${s['DESE LEA']}">${esc(s.School)}</option>`).join('');
  $('compositionSchool').addEventListener('change',renderComparisons);
  document.querySelectorAll('[data-level]').forEach(b=>{if(b.tagName==='BUTTON')b.addEventListener('click',()=>{globalLevel=b.dataset.level;document.querySelectorAll('#globalLevel button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderComparisons();});});
  $('studentsCaption').innerHTML=caption('School','2025 / 2025–26 prelim','Raw district and Building demographics; Cohort Master','Withheld markers remain nonnumeric');
  renderComparisons();renderPrograms();renderQuality();
  $('generatedAt').textContent='Build '+data.generated_at+' · Source periods appear with each visual.';
  $('loadStatus').hidden=true;$('dashboard').hidden=false;
  setupMainNavigation();
}
function renderComparisons(){
  const d=data.three_levels,level=globalLevel==='Missouri'?'School':globalLevel,lea=$('compositionSchool').value;
  const demo=d.demographics.filter(r=>r.level===level&&(lea==='all'||r.lea===lea));
  const rows=globalLevel==='Missouri'?[]:demo;
  $('compositionView').innerHTML=visual('composition','Student composition by '+level+', 2025',`<p>School total Black enrollment remains ${fmt(data.kpi_metrics.demographics.value)}%: ${fmt(data.kpi_metrics.demographics.numerator)} of ${fmt(data.kpi_metrics.demographics.denominator)} students, 2025.</p>`+plainTable(['School or Building','Independent reported race categories','FRL / EL / IEP','Missouri reference'],rows.map(r=>{const s=level==='School'?data.schools.find(s=>s['DESE LEA']===r.lea):data.buildings.find(b=>b['DESE LEA']===r.lea&&b['Building code']===r.building);return [esc(r.name),r.race.map(c=>`<div class="category-line">${esc(c.label)}: ${cellValue(c.value,c.status,'%')}${valid(c.value)?`<span class="mini-track"><i style="width:${c.value}%"></i></span>`:''}</div>`).join(''),['FRL %','EL %','IEP incidence %'].map(k=>`${esc(names[k])}: ${cellValue(s[k],s.statuses[k],'%')}`).join('<br>'),'Black: 15.3% (2024–25)<br>FRL: 49.3% (2024–25)<br>Context only; no difference calculated'];}))+`<p class="reference">${chips('Missouri','2024–25 / 2025')} Official published Black 15.3%, FRL 49.3%, EL 5.0%, IEP 13.93%. Different populations; rounded underlying counts are not reconstructed.</p>`,globalLevel,2025,'Raw DESE demographic files; official Missouri publications',`${rows.length} ${level} rows selected; five School / ten Building source cells withheld`);
  const units=level==='School'?data.schools.map(s=>({lea:s['DESE LEA'],building:null,name:s.School})):data.directory;
  $('mapMain').innerHTML=['Eng. Language Arts','Mathematics'].map(subject=>{
    const found=units.map(u=>{const row=d.map_rows.find(r=>r.lea===u.lea&&r.building===u.building&&r.subject===subject);return {...u,row,value:row?.PA_PCT??null,status:row?.status??(u.lea==='115911'&&u.building==='6955'?'not_applicable':'not_supplied')};});
    const state=data.state_map.find(r=>r.subject===subject&&r.group==='Total'),coverage=d.map_coverage[subject],pool=data.kpi_metrics.map[subject];
    const body=globalLevel==='Missouri'?'':plainTable([level,'Proficient + Advanced','Coverage','Joined SLU','Missouri, all tested grades'],found.map(r=>[esc(r.name),valid(r.value)?publicBar('',r.value):DISPLAY_STATUS[r.status],DISPLAY_STATUS[r.status],String(d.profiles.find(p=>p.lea===r.lea).joined),fmt(state.value)+'%']));
    return visual(subject==='Mathematics'?'mapMath':'mapELA',`${subject} proficiency by ${level}, 2025`,body+`<p>${chips('Missouri',2025)} Reference line: ${fmt(state.value)}%, all tested grades; contextual, not grade-matched.</p><p>Pooled across the 3 Schools DESE reports: ${fmt(pool.value)}% (${pool.numerator}/${pool.denominator}); ${fmt(coverage.share)}% of tested students (${coverage.reported_tested}/${coverage.all_tested}).</p>`,globalLevel,2025,'DESE district/Building MAP content-area files',`${found.filter(r=>valid(r.value)).length} of ${found.length} ${level==='School'?'Schools':'Buildings'} reported`);
  }).join('');
  const spread=['Eng. Language Arts','Mathematics'].map(subject=>{const rows=d.map_rows.filter(r=>(level==='School'?r.level==='Charter':r.level==='Building')&&r.PA_PCT!==null&&r.subject===subject).sort((a,b)=>b.PA_PCT-a.PA_PCT);return `${subject}: ${fmt(rows.at(-1).PA_PCT)}% at ${rows.at(-1).name} to ${fmt(rows[0].PA_PCT)}% at ${rows[0].name} among ${rows.length} reported ${level==='School'?'Schools':'Buildings'}.`;});
  $('learningTakeaway').textContent=globalLevel==='Missouri'?'Missouri all-tested-grade proficiency is a reference population, not a matched School or Building target.':spread.join(' ')+' Other combined values remain withheld or not applicable.';
  $('mapCaption').innerHTML=caption(globalLevel,2025,'Raw MAP files','School totals cover 1,753/2,002 ELA and 1,765/2,014 math reportable tests');
  $('growthTakeaway').textContent="In 2025, 7 of 13 eligible Buildings met Missouri's growth Target in English language arts, and 5 of 13 in math. Missouri: 24.99% and 24.67% of eligible Buildings.";
  const growthRows=level==='Building'?data.growth: data.schools.flatMap(s=>['Eng. Language Arts','Mathematics'].map(subject=>{const r=data.growth.filter(r=>r.lea===s['DESE LEA']&&r.subject===subject),eligible=r.filter(r=>r.eligible);return {name:s.School,lea:s['DESE LEA'],subject,designation:eligible.filter(r=>r.designation==='Target').length+' of '+eligible.length+' eligible Buildings',status:'reported'};}));
  $('growthMain').innerHTML=visual('growthVisual',`APR growth by ${level}, 2025`,plainTable([level,'Subject','Target designation / coverage','Joined SLU','Missouri reference'],(globalLevel==='Missouri'?[]:growthRows).map(r=>[esc(r.name),esc(r.subject),r.status==='not_applicable'?DISPLAY_STATUS.not_applicable:esc(r.designation),String(d.profiles.find(p=>p.lea===r.lea).joined),fmt(data.benchmarks.growth[r.subject].value)+'%']))+`<p>${chips('Missouri',2025)} English language arts: 498 / 1,993 (${fmt(data.benchmarks.growth['Eng. Language Arts'].value)}%); math: 492 / 1,994 (${fmt(data.benchmarks.growth.Mathematics.value)}%).</p>`,globalLevel,2025,'DESE APR Building supporting','13 eligible of 14 Buildings; table grouped at the selected level');
  $('growthCaption').innerHTML=caption('Building',2025,'APR Building ALL growth','7/13 ELA; 5/13 math; ECEC not applicable');
  installVisualExports();
}
function renderPrograms(){
  const inputs=data.three_levels.inputs,names={scholarships:'Scholarships',events:'Community events',partnership_reach:'Partnership reach and total students reached',oscp_operations:'OSCP support'};
  $('communityTakeaway').textContent='Only fully confirmed input rows contribute to program totals. The Gala tracker is a separate requests log and contributes no confirmed events or funding.';
  $('programPanels').innerHTML=Object.entries(names).map(([key,title])=>{
    const group=inputs[key];let body=group.confirmed.length?plainTable(['Confirmed item','Value','Source','Level / year'],group.confirmed.map(r=>[esc(measureLabel(r.program??r.event_name??r.program_name??r.measure)),r.awards_count!==undefined?cellValue(r.awards_count,'pending')+' awards':r.amount_approved_usd!==undefined?'$'+cellValue(r.amount_approved_usd,'pending'):r.students_served!==undefined?cellValue(r.students_served,'pending')+' students served':cellValue(r.value,'pending')+' '+esc(r.unit??''),esc(r.source),chips('School',r.award_year||r.reporting_period||r.as_of||r.fiscal_year||'Reporting period awaiting confirmation')])):'<p><strong>Awaiting confirmation</strong> · Owner: '+esc(group.owner)+'</p>';
    if(key==='events')body+=group.confirmed.filter(r=>r.photo_available).map(r=>`<img class="event-photo" src="${esc(r.photo_path)}" alt="${esc(r.event_name)} event photograph">`).join('');
    if(key==='scholarships')body+=group.confirmed.length?`<p>Confirmed awards: ${fmt(inputs.scholarship_totals.count)}. Confirmed total dollars: ${cellValue(inputs.scholarship_totals.dollars,'pending')}. Source: fully confirmed input rows only.</p>`:'<p>20 proposed, not yet confirmed. iSCORE $2,500: per award or program total? Candi to clarify.</p>';
    if(key==='partnership_reach'){const r=inputs.total_reach;body+=`<p>${esc(r.label)}${r.value!==null?': '+fmt(r.value):''}</p>${r.lower_bound!==null?`<p>Schools-only bound: ${fmt(r.lower_bound)}; Schools plus all confirmed partnership rows: ${fmt(r.upper_bound)}.</p>`:''}<details><summary>Total reach formula and included rows</summary><p>${esc(r.formula)}</p>${plainTable(['Included program','Students'],r.included.map(r=>[esc(r.program_name),fmt(r.students_served)]))}</details>`;}
    body+=plainTable(['Pending item','Status','Owner','Level / year'],(group.pending.length?group.pending:[{}]).map(r=>[esc(measureLabel(r.program??r.event_name??r.program_name??r.measure??title)),'Awaiting confirmation',esc(group.owner),chips('School',r.award_year??'Period awaiting confirmation')]));
    return visual('program-'+key,title,body,'School',key==='scholarships'?'2026–27 proposed':'Period awaiting confirmation','data/inputs/'+key+'.csv',group.confirmed.length?`${group.confirmed.length} fully confirmed rows; pending rows excluded`:'Awaiting confirmation; pending rows excluded');
  }).join('');
}
const GLOSSARY={MAP:'Missouri Assessment Program: statewide achievement assessments.',MSIP:'Missouri School Improvement Program: reporting and accountability framework.',DESE:'Missouri Department of Elementary and Secondary Education.',APR:'Annual Performance Report.',FRL:'Free or reduced-price lunch eligibility, using January membership.',IEP:'Individualized Education Program; incidence follows the published source definition.',EL:'English learner.', 'P+A':'Proficient plus Advanced achievement counts. Both published components are required.',LEA:'Local education agency: the DESE district identifier (lea in data).','K–12':'Kindergarten through grade 12.','PK':'Preschool; kept separate from K–12.','Target':'Exact APR growth designation with full growth points; On-Track is not Target.','Withheld':'DESE supplies an asterisk instead of a value; the extracts do not state why.','School':'School (charter network / DESE district)','Building':'One of 14 DESE Building identifiers; not necessarily a unique campus.'};
function renderQuality(){
  const cells=data.three_levels.coverage,metrics=['Demographics','MAP','Growth','Preliminary enrollment','Physical campuses','OSCP programs'];
  $('qualityMatrix').innerHTML=visual('quality','Coverage by reporting level, 2025 and current inputs',plainTable(['Measure','Missouri','School','Building'],metrics.map((name,i)=>[name,i<3?'Reported; context only':i===3?'Not applicable':'Awaiting confirmation',i===0?'Reported / Withheld by DESE (5 of 42)':i===1?'Reported / Withheld by DESE':i===2?'Building measure, aggregated by School':i===3?'Master reported; raw files Not in supplied source':'Awaiting confirmation',i===0?'Reported / Withheld by DESE (10 of 98)':i===1?'Reported / Withheld by DESE / Not applicable':i===2?'Reported / Not applicable':i===3?'Master reported; raw files Not in supplied source':'Awaiting confirmation'])),'School','2025 / inputs pending','Raw-source missing-data audit','11 workbooks / 21 worksheets');
  const t=data.three_levels.tracker_summary;$('requestLogSummary').innerHTML=`<h3>Sponsorship requests log</h3><p>${t.distinct_records} distinct records after deduplication from ${t.raw_rows} rows. ${t.with_decision} with a decision status; ${t.with_approved_amount} with an approved amount. These are request-log completeness counts, not approved events or funding.</p>${chips('School','Period not supplied')} <a href="explorer.html#requestsLog">Open requests and recorded request amounts</a>`;
  $('glossary').innerHTML='<dl>'+Object.entries(GLOSSARY).map(([term,definition])=>`<dt>${esc(term)}</dt><dd>${esc(definition)}</dd>`).join('')+'</dl>';
  $('sourceRegister').innerHTML=sourceRegisterHtml(data.public_sources);
  $('ownerQuestions').innerHTML=plainTable(['Question','Owner','Status'],[['Source of OSCP overview 4,081; not a matching DESE series','Candi','Awaiting confirmation'],['Headline K–12 versus PK–12','Candi','Awaiting confirmation'],['iSCORE amount and split of 20 proposed awards','Candi','Awaiting confirmation'],['Physical campus definition and counts','Candi','Awaiting confirmation'],['Partnership counts and overlap rules','Ryan','Awaiting confirmation'],['Event list, dates, attendance and photos','Ryan and Candi','Awaiting confirmation'],['Raw preliminary enrollment files','Harshil','Not in supplied source'],['Meaning of “Missing from Biome, Hope Leadership”','Abigail','Awaiting confirmation']]);
}
function visitorText(s){return (s==='Charter'?'School':String(s)).replace(/\bcharter networks\b/gi,'Schools').replace(/\bnetwork(s)?\b/gi,(_,s)=>s?'Schools':'School').replace(/charter-level/gi,'School-level').replace(/charter schools/gi,'Schools').replace(/DESE-listed individual schools \/ buildings/gi,'Building directory').replace(/individual school\/building records/gi,'Buildings').replace(/Unavailable\*/g,'Not in supplied source');}
function installLabels(){
  let busy=false;const normalize=()=>{if(busy)return;busy=true;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(['SCRIPT','STYLE'].includes(n.parentElement.tagName)||n.parentElement.closest('#glossary'))continue;const t=visitorText(n.textContent);if(t!==n.textContent)n.textContent=t;}document.querySelectorAll('select option').forEach(n=>n.textContent=visitorText(n.textContent));busy=false;};
  normalize();document.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(n=>['aria-label','title','placeholder','alt'].forEach(a=>{if(n.hasAttribute(a))n.setAttribute(a,visitorText(n.getAttribute(a)));}));const observer=new MutationObserver(()=>{observer.disconnect();normalize();observer.observe(document.body,{childList:true,subtree:true});});observer.observe(document.body,{childList:true,subtree:true});
}
function setupMainNavigation(){
  $('menuToggle').addEventListener('click',()=>{const open=$('menuToggle').getAttribute('aria-expanded')!=='true';$('menuToggle').setAttribute('aria-expanded',String(open));$('navLinks').classList.toggle('is-open',open);});
  document.querySelectorAll('#navLinks a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{$('navLinks').classList.remove('is-open');$('menuToggle').setAttribute('aria-expanded','false');}));
  $('printReport').addEventListener('click',()=>window.print());
  const links=[...document.querySelectorAll('#navLinks a[href^="#"]')];addEventListener('scroll',()=>{let active=links[0];links.forEach(a=>{if(document.querySelector(a.hash)?.getBoundingClientRect().top<150)active=a;});links.forEach(a=>a.toggleAttribute('aria-current',a===active));},{passive:true});
}
function setupExplorerShell(){
  $('printReport').onclick=()=>window.print();$('menuToggle').onclick=()=>{$('navLinks').classList.toggle('is-open');$('menuToggle').setAttribute('aria-expanded',String($('navLinks').classList.contains('is-open')));};
  const tracker=data.requests;$('requestLog').innerHTML=visual('requestsVisual','Sponsorship requests log by School / request organization',plainTable(['Organization','Classification','Requested amount recorded','Decision','Approved amount','Level / year'],tracker.records.map(r=>[esc(r.organization),esc(r.category),cellValue(r.requested,'not_supplied'),cellValue(r.decision,'not_supplied'),cellValue(r.approved,'not_supplied'),chips('School',r.year)])),'School','Period not supplied','oscp_gala_sponsorship_tracker.xlsx',`${tracker.distinct_records} distinct records / ${tracker.raw_rows} rows; 0 decisions; 0 approved amounts`);
  $('sourceList').innerHTML=sourceRegisterHtml(data.public_sources)+'<p>Raw preliminary enrollment source files are missing; the enrollment total currently traces to the master. Owner: Harshil.</p>';
  document.querySelectorAll('.report').forEach(el=>{const id=el.id.replace('Panel',''),year=['enrollment'].includes(id)?'2025–26 prelim':id==='schoolList'?'Directory Jun 2026':'2025',level=['schoolList','growth','matchedMap'].includes(id)?'Building':'School';el.dataset.level=level;el.dataset.year=year;el.setAttribute('data-visual','');const cap=document.createElement('p');cap.className='caption';cap.innerHTML=caption(level,year,'See source file and source rows below','Selected report coverage shown above');el.append(cap);const png=document.createElement('button');png.textContent='Download PNG';png.dataset.visualPng=el.id;el.querySelector('.chart-heading').append(png);});
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const t=document.querySelector(a.hash);if(t){e.preventDefault();t.closest('details')?.setAttribute('open','');t.scrollIntoView();}}));
  if(location.hash){const target=document.querySelector(location.hash);target?.closest('details')?.setAttribute('open','');target?.scrollIntoView();}
  installVisualExports();
  document.querySelectorAll('.report').forEach(el=>updateReportMetadata(el.id.replace('Panel','')));
  for(const id of ['mapWorkspace','growthWorkspace']){
    const p=document.createElement('p');p.className='outcome-limit';p.textContent='These figures describe results at sponsored schools. They do not show that SLU sponsorship caused them. Schools joined SLU in different years. '+data.schools.map(s=>s.School+': joined SLU '+s['SLU sponsor since']).join('; ');$(id).insertBefore(p,$(id).children[1]);
  }
}
function sourceRegisterHtml(sources){return '<ul>'+sources.map(s=>{const file=s.local_path.split('/').pop(),period=file.includes('directory')?'Directory Jun 2026':file.includes('2024_2025')?'2024–25':file.includes('2025')?'2025':file.includes('renewal_2026')?'2025 demographics / 2026 renewal':file.includes('2022')?'2022':'Mixed source periods; see publication';return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(file)}</a> · ${period} · retrieved ${esc(s.retrieved_at)}</li>`;}).join('')+'</ul>';}
function visualCsv(el){
  const title=visitorText(el.querySelector('h3,h4')?.textContent??'Report'),meta=[['Title',title],['Level',el.dataset.level],['Year',el.dataset.year],['Caption',el.querySelector('.caption')?.textContent??'']],rows=[...el.querySelectorAll('tr')].map(tr=>[el.dataset.level,el.dataset.year,...[...tr.children].map(c=>visitorText(c.textContent))]);
  if(!rows.length)rows.push([el.dataset.level,el.dataset.year,visitorText(el.innerText)]);
  const context=[...el.querySelectorAll('p:not(.caption)')].map(p=>visitorText(p.textContent)).join(' ');if(context)rows.push([el.dataset.level,el.dataset.year,'Interpretation / additional figures',context]);
  return [...meta,[],...rows].map(r=>r.map(v=>'"'+String(v??'Not in supplied source').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function saveBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function pngVisual(el){
  const candidate=el.querySelector('canvas'),chart=candidate&&!candidate.parentElement.hidden?candidate:null,title=visitorText(el.querySelector('h3,h4')?.textContent??'Report'),cap=visitorText(el.querySelector('.caption')?.textContent??'');
  const tableLines=[...el.querySelectorAll('tr')].map(r=>visitorText(r.innerText)),bodyLines=tableLines.length?tableLines:el.innerText.split('\n').filter(t=>t.trim()&&!/Download (PNG|CSV)/.test(t)).map(visitorText),lines=[title,cap,...(!chart?bodyLines:[])];
  const canvas=document.createElement('canvas');canvas.width=1600;const ctx=canvas.getContext('2d');ctx.font='24px sans-serif';const wrapped=[];
  lines.forEach(line=>{let text='';for(const word of line.split(/\s+/)){if(ctx.measureText(text+' '+word).width>1500){wrapped.push(text);text=word;}else text+=' '+word;}wrapped.push(text);});const scale=chart?Math.min(2,1500/chart.width):1;canvas.height=Math.max(500,wrapped.length*36+80+(chart?chart.height*scale:0));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#102c45';ctx.font='24px sans-serif';wrapped.forEach((line,i)=>ctx.fillText(line,35,40+i*36));if(chart)ctx.drawImage(chart,35,wrapped.length*36+60,chart.width*scale,chart.height*scale);canvas.toBlob(b=>saveBlob(b,'oscp-'+el.id+'.png'));
}
function installVisualExports(){document.querySelectorAll('[data-visual-csv]').forEach(b=>b.onclick=()=>saveBlob(new Blob(['\uFEFF'+visualCsv($(b.dataset.visualCsv))],{type:'text/csv;charset=utf-8'}),'oscp-'+b.dataset.visualCsv+'.csv'));document.querySelectorAll('[data-visual-png]').forEach(b=>b.onclick=()=>pngVisual($(b.dataset.visualPng)));}
function installDXExports(){
  const state=DemographicsExplorer.state;
  document.querySelectorAll('.dx-panel').forEach((el,i)=>{
    if(!el.id)el.id='dxVisual'+i;el.dataset.level=state.building==='all'?'School':'Building';el.dataset.year=i===1||i===2?'History through '+state.year:String(state.year);el.setAttribute('data-visual','');
    let cap=el.querySelector('.caption');if(!cap){cap=document.createElement('p');cap.className='caption';el.append(cap);}cap.innerHTML=caption(el.dataset.level,el.dataset.year,'DESE district / Building demographics','Source missingness and selected population shown above');
    if(!el.querySelector('[data-visual-png]')){const controls=document.createElement('div');controls.className='export-controls';controls.innerHTML=`<button data-visual-csv="${el.id}">Download CSV</button><button data-visual-png="${el.id}">Download PNG</button>`;el.append(controls);}
  });
  document.querySelectorAll('.dx-panel [data-visual-csv]').forEach(b=>b.onclick=()=>document.getElementById('dxExport').click());installVisualExports();
  // A coordinated export includes full source precision and level/year on every row.
  document.querySelectorAll('.dx-panel [data-visual-csv]').forEach(b=>b.onclick=()=>document.getElementById('dxExport').click());
}
function installModes(){
  const params=new URLSearchParams(location.search);if(params.get('embed')==='1'){document.body.classList.add('embedded');const origins=['https://www.slu.edu','https://slu.edu'];const send=()=>origins.forEach(origin=>parent.postMessage({type:'oscp-dashboard-height',height:document.documentElement.scrollHeight},origin));new ResizeObserver(send).observe(document.body);send();}
  const expanded=[];addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(d=>{if(!d.open){d.open=true;expanded.push(d);}}));addEventListener('afterprint',()=>expanded.splice(0).forEach(d=>d.open=false));
  if(!$('presentationButton'))return;let current=0,slides=[],beforeMode=null;
  function show(i){current=Math.max(0,Math.min(i,slides.length-1));slides.forEach((s,j)=>s.hidden=j!==current);$('slideCounter').textContent=`${current+1} / ${slides.length}`;}
  function exit(){document.body.classList.remove('present');$('presentationHost')?.remove();$('slideControls').hidden=true;const url=new URL(location);url.searchParams.delete('present');history.replaceState(null,'',url);if(beforeMode){globalLevel=beforeMode.level;$('compositionSchool').value=beforeMode.school;document.querySelectorAll('#globalLevel button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.level===globalLevel)));renderComparisons();beforeMode=null;}}
  function enter(){if($('presentationHost'))return;beforeMode={level:globalLevel,school:$('compositionSchool').value};globalLevel='School';$('compositionSchool').value='all';renderComparisons();const host=document.createElement('div');host.id='presentationHost';data.three_levels.slides.forEach(spec=>{const visual=$(spec.visual);if(!visual)return;const slide=document.createElement('section');slide.className='deck-slide';slide.innerHTML=`<p class="eyebrow">SLU OSCP CHARTER PARTNERSHIPS</p><h2>${esc(spec.headline)}</h2><p class="slide-question">${esc(spec.question)}</p><p class="slide-takeaway">${esc(spec.takeaway)}</p>`;const clone=visual.cloneNode(true);clone.querySelectorAll('button').forEach(b=>b.remove());if(spec.filter_name)clone.querySelectorAll('tbody tr').forEach(r=>{if(r.children[0].textContent!==spec.filter_name)r.remove();});clone.removeAttribute('id');slide.append(clone);host.append(slide);});document.body.append(host);slides=[...host.children];document.body.classList.add('present');$('slideControls').hidden=false;show(0);}
  $('presentationButton').onclick=enter;$('previousSlide').onclick=()=>show(current-1);$('nextSlide').onclick=()=>show(current+1);$('exitPresentation').onclick=exit;
  let printCreated=false;addEventListener('beforeprint',()=>{if(!document.body.classList.contains('present')){enter();printCreated=true;}slides.forEach(s=>s.hidden=false);});addEventListener('afterprint',()=>{if(printCreated){printCreated=false;exit();}else show(current);});
  addEventListener('keydown',e=>{if(!document.body.classList.contains('present'))return;if(e.key==='Escape')exit();else if(e.key==='ArrowRight'){e.preventDefault();show(current+1);}else if(e.key==='ArrowLeft'){e.preventDefault();show(current-1);}});
  let start=0;addEventListener('touchstart',e=>start=e.touches[0].clientX,{passive:true});addEventListener('touchend',e=>{if(document.body.classList.contains('present')&&Math.abs(e.changedTouches[0].clientX-start)>50)show(current+(e.changedTouches[0].clientX<start?1:-1));},{passive:true});if(params.get('present')==='1')enter();
}
async function boot(){
 try{
  if(document.body.dataset.page==='explorer'){
   const summary=await fetch('./summary.json').then(r=>{if(!r.ok)throw Error('Summary missing');return r.json()});
   const packets=await Promise.all(summary.explorer_files.map(f=>fetch('./'+f).then(r=>{if(!r.ok)throw Error(f+' unavailable');return r.json()})));
   data=Object.assign({},...packets);data.three_levels=summary.three_levels;data.public_sources=summary.public_sources;data.requests=packets.find(p=>p.tracker)?.tracker;
   initializeLegacy();
  }else{data=await fetch('./summary.json').then(r=>{if(!r.ok)throw Error('Summary unavailable');return r.json()});renderMain();}
  installModes();installLabels();
 }catch(error){$('loadStatus').hidden=false;$('loadStatus').textContent='Dashboard could not load: '+error.message;}
}
boot();
