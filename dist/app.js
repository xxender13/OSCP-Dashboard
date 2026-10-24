'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => valid(v) ? v.toLocaleString('en-US',{maximumFractionDigits:2}) : 'Unavailable';
const colors = ['#003DA5','#85651d','#007875','#764e9b','#ad463e','#536579'];
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
function schoolEntries() { return [['all','All Schools'],...data.schools.map(s=>[s['DESE LEA'],s.School])]; }
function control(id,label,entries) { return `<div><label for="${id}">${esc(label)}</label><select id="${id}">${entries.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`; }
function schoolControl(id) {return control(id,'School',schoolEntries());}
function levelControl(id) {return control(id,'Reporting level',[['Charter','Charter schools'],['Building','DESE building records']]);}
function sortControl(id) {return control(id,'Sort by',[['desc','Value: high to low'],['asc','Value: low to high'],['name','Name: A–Z']]);}
function report(id,mount,title,description,controls,source) {
  $(mount).innerHTML=`<article id="${id}Panel" class="panel report"><div class="chart-heading"><div><p class="eyebrow">INTERACTIVE REPORT</p><h3 id="${id}Title">${esc(title)}</h3></div><button type="button" class="download" data-export="${id}">Download CSV</button></div><p class="report-description">${esc(description)}</p><form class="local-filters" id="${id}Filters">${controls}<button type="reset">Reset chart</button></form><p id="${id}Context" class="context" aria-live="polite"></p><div id="${id}Insight" class="insight"></div><div id="${id}Legend" class="legend" aria-label="Chart legend"></div><div id="${id}Plot" class="plot"><canvas id="${id}Chart" role="img" aria-labelledby="${id}Title" aria-describedby="${id}Context ${id}Data"></canvas></div><div id="${id}Data" class="scroll" tabindex="0" role="region" aria-label="${esc(title)} values"></div><p class="source">${esc(source)}</p></article>`;
}
function table(id,caption,headers,rows) {
  $(id).innerHTML=`<table><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i?`<td>${esc(valid(v)?(/year|since/i.test(headers[i])?String(v):fmt(v)):v??'Unavailable')}</td>`:`<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function storeTable(id,caption,headers,rows) { exportsByReport[id]={headers,rows};table(id+'Data',caption,headers,rows); }
function legend(id,series,type='bar') {
  const symbols={circle:'●',rect:'■',triangle:'▲',rectRot:'◆',crossRot:'×',star:'✦'};
  $(id+'Legend').innerHTML=series.map((s,i)=>`<span>${type==='bar'?`<b style="background:${s.color??colors[i%colors.length]}"></b>`:`<b class="point-key" style="color:${s.color??colors[i%colors.length]}" aria-hidden="true">${symbols[s.options?.pointStyle??shapes[i%shapes.length]]}</b>`}${esc(s.label)}</span>`).join('');
}
function destroy(id) {if(charts[id]){charts[id].destroy();delete charts[id];}}
function wrapLabel(label,limit) {return String(label).split(' ').reduce((lines,w)=>{if((lines.at(-1)+' '+w).trim().length>limit&&lines.at(-1))lines.push(w);else lines[lines.length-1]+=(lines.at(-1)?' ':'')+w;return lines;},['']);}
function draw(id,type,labels,series,unit,extra={}) {
  destroy(id);
  const available=series.some(s=>s.values.some(v=>valid(v)||v&&valid(v.x)&&valid(v.y)));
  $(id+'Plot').hidden=!window.Chart||!available;
  legend(id,series,type);
  if(!window.Chart||!available)return;
  const horizontal=type==='bar';
  $(id+'Plot').style.height=horizontal?`${Math.max(320,labels.length*(series.length>1?75:58)+70)}px`:'360px';
  const plugin={id:'barValues',afterDatasetsDraw(c){if(!horizontal)return;const ctx=c.ctx;ctx.save();ctx.fillStyle='#172b45';ctx.font='11px system-ui';c.data.datasets.forEach((set,i)=>{if(!c.isDatasetVisible(i))return;c.getDatasetMeta(i).data.forEach((bar,j)=>{if(valid(set.data[j]))ctx.fillText(`${fmt(set.data[j])}${unit==='%'?'%':''}`,bar.x+5,bar.y+4);});});ctx.restore();}};
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

function renderDemographics() {
  const id='demographics',rows=records('demoSchool','demoLevel');
  metricOptions('demoMetric',names,rows,'FRL %');const field=$('demoMetric').value;
  const reportable=sortRows(rows.filter(r=>valid(r[field])),field,'demoSort');
  $('demographicsContext').textContent=`2025 · ${$('demoLevel').selectedOptions[0].textContent} · ${reportable.length} of ${rows.length} records report ${names[field]}.`;
  $('demographicsInsight').textContent=field==='FRL %'?'FRL describes eligibility for free or reduced-price lunch; it is not a direct measure of household income.':field==='IEP incidence %'?'IEP incidence follows the DESE source definition; it is not recalculated from rounded percentages.':field==='EL %'?'English learners are students identified in the source EL field. Unavailable groups are not assumed to be absent.':'This is one reported racial/ethnic category. Categories are incomplete; do not interpret this chart as the full student composition.';
  draw(id,'bar',reportable.map(r=>r.label),[{label:`${names[field]} · 2025 (%)`,values:reportable.map(r=>r[field])}],'%');
  storeTable(id,'Filtered demographic values · 2025',['School / building',`${names[field]} (%)`,'LEA','Source worksheet','Source row'],reportable.map(r=>[r.label,r[field],r['DESE LEA'],$('demoLevel').value==='Building'?'Building Cohort':'Cohort Master',r.source_row]));
}
function renderEnrollment() {
  const id='enrollment',rows=records('enrollSchool','enrollLevel');
  metricOptions('enrollMetric',enrollmentMetrics,rows,'2025–26 K–12');const field=$('enrollMetric').value;
  const reportable=sortRows(rows.filter(r=>valid(r[field])),field,'enrollSort');
  const total=reportable.reduce((sum,r)=>sum+r[field],0),complete=reportable.length===rows.length;
  $('enrollmentContext').textContent=`${enrollmentMetrics[field]} · ${$('enrollLevel').selectedOptions[0].textContent} · ${reportable.length} of ${rows.length} records report a value.`;
  $('enrollmentInsight').innerHTML=`<strong id="reachCount">${fmt(total)}</strong> ${complete?'students in the selected records':'students in reportable records only; not a complete total'}. ${field.includes('PK')?'Preschool is shown separately. It is not added to K–12 to reconstruct missing PK–12 totals.':'Each record is counted once at the chosen reporting level. Preliminary and historical periods are separate.'}`;
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
  draw(id,'bar',entities.map(([,name])=>name),series,unit);
  const headers=['School / building','Subject',assessmentMetrics[field],'Reportable tested','Accountable','Below Basic count','Basic count','Proficient count','Advanced count','Level not determined count','Below Basic (%)','Basic (%)','Proficient (%)','Advanced (%)','Level not determined (%)','LEA','Building code','Source file','Source row'];
  storeTable(id,'Source values · 2025 · unavailable fields are not reconstructed',headers,reportable.map(r=>[r.name,r.subject,r[field],r.REPORTABLE,r.ACCOUNTABLE,r.BELOW_BASIC,r.BASIC,r.PROFICIENT,r.ADVANCED,r.LEVEL_NOT_DETERMINED,r.BELOW_BASIC_PCT,r.BASIC_PCT,r.PROFICIENT_PCT,r.ADVANCED_PCT,r.LEVEL_NOT_DETERMINED_PCT,r.lea,r.building??'Charter',r.source_file,r.source_row]));
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
  $('coverageData').querySelectorAll('tbody td').forEach(td=>{td.classList.add(td.textContent==='Unavailable'?'missing-cell':'reported-cell');});
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
  storeTable('directory','Source: Cohort Master · percentages and MAP are 2025',['School','LEA',...usableFields,'Source row'],rows.map(r=>[r.School,r['DESE LEA'],...usableFields.map(f=>r[f]),r.source_row]));
  $('directoryPlot').hidden=true;$('directoryLegend').hidden=true;
}

function download(id) {
  const {headers,rows}=exportsByReport[id];
  const cell=v=>{let s=String(v??'Unavailable');if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const metadata=[['Report',$(id+'Title').textContent],['Filter context',$(id+'Context').textContent],['Generated UTC',data.generated_at]];
  const blob=new Blob(['\uFEFF'+[...metadata,[],headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`oscp-${id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const renderers={demographics:renderDemographics,enrollment:renderEnrollment,assessment:renderAssessment,history:renderHistory,timeline:renderTimeline,coverage:renderCoverage,directory:renderDirectory};
function initialize() {
  const metric=control('demoMetric','Student measure',Object.entries(names));
  report('demographics','demographicsMount','Who our schools enroll · 2025','Compare one student characteristic at a time. Percentages describe the source school or building, not a combined average.',schoolControl('demoSchool')+levelControl('demoLevel')+metric+sortControl('demoSort'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort · 2025 demographics.');
  report('timeline','timelineMount','Partnership milestones','See when each school opened and when its SLU sponsorship began.',schoolControl('timelineSchool')+control('timelineEvent','Milestones',[['both','Opening & sponsorship'],['opened','School opening'],['sponsor','SLU sponsorship start']]),'Source: OSCP DESE Cohort Master · Opened school year / SLU sponsor since.');
  report('assessment','assessmentMount','Academic outcomes · MAP 2025','Explore subjects and student groups using the same reporting level. P+A means Proficient + Advanced.',schoolControl('mapSchool')+levelControl('mapLevel')+control('mapGroup','Student group',[])+control('mapMetric','Outcome measure',[])+control('mapSubject','Subject',[]),'Source: supplied 2025 DESE district / school content-area workbooks. Every record matches a sponsored-school LEA and, for building views, a verified cohort building code. Counts and percentages retain source suppression.');
  report('history','historyMount','How school records changed over time','Follow annual enrollment or demographic percentages, with separate lines for each school.',schoolControl('historySchool')+control('historyMetric','Historical measure',[])+control('historyStart','From year',[])+control('historyEnd','To year',[]),'Source: OSCP DESE Cohort Master · Historical Demographics · 2007–2025 (school coverage varies). Historical records do not represent current enrollment.');
  report('coverage','coverageMount','Which values are available?','Check coverage before interpreting a comparison. Every reported value is displayed alongside unavailable fields.',schoolControl('coverageSchool')+levelControl('coverageLevel'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort. No missing data is treated as zero.');
  report('directory','directoryMount','Explore the school directory','Search source school names and identifiers, choose a column group, and download the filtered directory.',schoolControl('directorySchool')+'<div><label for="directorySearch">Search name or LEA</label><input type="search" id="directorySearch" placeholder="School name or code"></div>'+control('directoryFields','Column group',[['all','All available fields'],['enrollment','Enrollment & building records'],['demographics','Demographics · 2025'],['assessment','MAP outcomes · 2025']]),'Source: OSCP DESE Cohort Master · Cohort Master. Unverified location and grade spans are omitted.');
  report('enrollment','enrollmentMount','Enrollment in detail','Compare K–12 or reportable preschool enrollment at the charter or DESE building level. Select one period and measure at a time.',schoolControl('enrollSchool')+levelControl('enrollLevel')+control('enrollMetric','Enrollment & period',Object.entries(enrollmentMetrics))+sortControl('enrollSort'),'Source: OSCP DESE Cohort Master · Cohort Master / Building Cohort. Charter K–12 totals reconcile to building records.');
  const total=data.schools.reduce((n,r)=>n+r['2025–26 K–12'],0),paired=data.schools.filter(s=>valid(s['MAP ELA P+A %'])&&valid(s['MAP Math P+A %'])).length;
  $('kpis').innerHTML=[['Sponsored schools',data.schools.length,'Unique DESE charter identifiers'],['Preliminary K–12 enrollment',fmt(total),'2025–26 · preschool excluded'],['Schools with paired ELA / Math',`${paired} / ${data.schools.length}`,'2025 · reportable Proficient + Advanced']].map(([label,value,note])=>`<div class="kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  Object.entries(renderers).forEach(([id,render])=>{const form=$(id+'Filters');form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('change',render);form.addEventListener('reset',()=>setTimeout(()=>{
    const defaults={demoMetric:'FRL %',enrollMetric:'2025–26 K–12',mapGroup:JSON.stringify(['MSIP Total','Total']),mapMetric:'PA_PCT',mapSubject:'all',historyMetric:'K–12 enrollment'};
    Object.entries(defaults).forEach(([key,value])=>{if(form.contains($(key))&&[...$(key).options].some(o=>o.value===value))$(key).value=value;});
    if(id==='history'){$('historyStart').selectedIndex=0;$('historyEnd').selectedIndex=$('historyEnd').options.length-1;}
    render();
  },0));});
  $('directorySearch').addEventListener('input',renderDirectory);
  document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>download(b.dataset.export)));
  $('resetAll').addEventListener('click',()=>Object.keys(renderers).forEach(id=>$(id+'Filters').reset()));
  $('printReport').addEventListener('click',()=>window.print());
  $('sourceList').innerHTML='<ul>'+data.sources.map(s=>`<li><strong>${esc(s.Dataset)}</strong> · ${esc(s['Reporting period'])}<br>${esc(s['Uploaded source filename'])}</li>`).join('')+'</ul>';
  table('inventoryTable','All source worksheets inspected; raw workbooks remain local',['Workbook','Worksheet','Nonempty rows'],data.data_inventory.map(s=>[s.file,s.sheet,s.rows]));
  $('definitions').innerHTML=Object.values(data.definitions).map(s=>`<p>${esc(s)}</p>`).join('');
  $('generatedAt').textContent=`Data generated ${new Date(data.generated_at).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC · Reporting periods appear within each report.`;
  $('dashboard').hidden=false;$('loadStatus').hidden=true;$('chartFallback').hidden=Boolean(window.Chart);
  Object.values(renderers).forEach(render=>render());
}
fetch('./dashboard-data.json').then(r=>{if(!r.ok)throw Error('Data file could not be retrieved');return r.json();}).then(payload=>{data=payload;initialize();}).catch(error=>{$('loadStatus').hidden=false;$('loadStatus').textContent=`Dashboard could not load: ${error.message}. Please reload or try again later.`;});
