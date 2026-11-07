'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => valid(v) ? v.toLocaleString('en-US',{maximumFractionDigits:2}) : 'Unavailable*';
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
  $(id).innerHTML=`<table><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i?`<td>${esc(valid(v)?(/year|since/i.test(headers[i])?String(v):fmt(v)):v??'Unavailable*')}</td>`:`<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function storeTable(id,caption,headers,rows) {
  exportsByReport[id]={headers,rows};table(id+'Data',caption,headers,rows);
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
  const {headers,rows}=exportsByReport[id];
  const cell=v=>{let s=String(v??'Unavailable*');if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const metadata=[['Report',$(id+'Title').textContent],['Filter context',$(id+'Context').textContent],['Generated UTC',data.generated_at],['Missing data',data.missing_data_note]];
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
function initialize() {
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
  renderKpis();
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
  renderPublicStory();setupStoryNavigation();
}
fetch('./dashboard-data.json').then(r=>{if(!r.ok)throw Error('Data file could not be retrieved');return r.json();}).then(payload=>{data=payload;initialize();}).catch(error=>{$('loadStatus').hidden=false;$('loadStatus').textContent=`Dashboard could not load: ${error.message}. Please reload or try again later.`;});
