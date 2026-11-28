#!/usr/bin/env python3
"""Reusable compiler for canonical authored records; the reviewed pilot stays frozen."""
import ast, hashlib, json, math, operator, re, subprocess, os
import yaml
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt
from docx.oxml import OxmlElement
from docx.enum.section import WD_ORIENT
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(os.environ.get('CBE_WORKSPACE', ROOT/'data/curriculum_expansion_2026-11')).resolve()
PHASES=['Predict Phase','Observe Phase','Explain Phase','Driving Question Board (DQB) Creation','Model Building Phase']
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Pow:operator.pow}
FUNCS={'sqrt':math.sqrt,'sin_deg':lambda x:math.sin(math.radians(x)),'cos_deg':lambda x:math.cos(math.radians(x)),'tan_deg':lambda x:math.tan(math.radians(x)),'atan_deg':lambda x:math.degrees(math.atan(x))}
def attribution_footer(document):
 """Read the workspace attribution override for companion documents as well."""
 config=yaml.safe_load((BASE/'attribution.yaml').read_text())
 from datetime import date
 year=str(date.today().year) if config['year']=='auto' else str(config['year'])
 text=config['lesson_footer'].replace('{YEAR}',year)
 paragraph=document.sections[0].footer.paragraphs[0]
 paragraph.text=text
 for run in paragraph.runs:
  run.font.name='Arial';run.font.size=Pt(7)
 document.sections[0].footer_distance=Inches(.15)
def calc(expr):
 def walk(n):
  if isinstance(n,ast.Constant) and type(n.value) in (int,float):return n.value
  if isinstance(n,ast.BinOp) and type(n.op) in OPS:return OPS[type(n.op)](walk(n.left),walk(n.right))
  if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.USub):return -walk(n.operand)
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in FUNCS and not n.keywords:return FUNCS[n.func.id](*[walk(a) for a in n.args])
  raise ValueError('Unsupported expression')
 return walk(ast.parse(expr,mode='eval').body)
def image_spec(base,item):
 """Resolve a declared source image and optional pixel crop without editing it."""
 from PIL import Image
 from docx.image.image import Image as WordImage
 from docx.image.exceptions import InvalidImageStreamError,UnexpectedEndOfFileError,UnrecognizedImageError
 materials=(base/'materials').resolve()
 explicit=item.get('diagram')
 if explicit and explicit not in item.get('assets',[]):
  raise ValueError('diagram must be listed in assets for fingerprint binding')
 path=(materials/explicit if explicit else materials/'diagrams'/(item['id']+'.png')).resolve()
 if not path.is_relative_to(materials):raise ValueError('diagram must remain inside materials')
 if not path.is_file():
  if explicit or item.get('diagram_crop') is not None:raise ValueError('diagram file missing')
  return None
 with Image.open(path) as source:w,h=source.size
 try:WordImage.from_file(str(path))
 except (InvalidImageStreamError,UnexpectedEndOfFileError,UnrecognizedImageError) as exc:
  raise ValueError('diagram format is not supported by the Word renderer') from exc
 box=item.get('diagram_crop',[0,0,w,h])
 if (not isinstance(box,(list,tuple)) or len(box)!=4 or
     any(type(v) is not int for v in box) or
     not (0<=box[0]<box[2]<=w and 0<=box[1]<box[3]<=h)):
  raise ValueError('diagram crop must be a nonempty in-bounds integer pixel box')
 return path,(w,h),tuple(box)
def add_material_image(document,item):
 """Use a Word crop frame; preserve original micrograph bytes and scale bars."""
 spec=image_spec(BASE,item)
 if spec is None:return
 path,(w,h),(left,top,right,bottom)=spec
 effective_w,effective_h=right-left,bottom-top
 width=min(6.3,6.5*effective_w/effective_h)
 shape=document.add_picture(str(path),width=Inches(width),height=Inches(width*effective_h/effective_w))
 if (left,top,right,bottom)!=(0,0,w,h):
  rect=OxmlElement('a:srcRect')
  for key,value in [('l',left/w),('t',top/h),('r',(w-right)/w),('b',(h-bottom)/h)]:
   rect.set(key,str(round(value*100000)))
  shape._inline.xpath('.//pic:blipFill')[0].insert(1,rect)
def write_doc(path,title,items,teacher=False):
 d=Document(); sec=d.sections[0];sec.top_margin=sec.bottom_margin=Inches(.65)
 attribution_footer(d)
 style=d.styles['Normal'];style.font.name='Arial';style.font.size=Pt(11)
 d.add_heading(title,0);d.add_paragraph('Grade 10 • OpenAI-only curriculum draft • teacher review copy')
 for item in items:
  d.add_heading(item['id']+' — '+item['title'],1)
  d.add_paragraph(item['student'])
  add_material_image(d,item)
  if teacher:d.add_heading('Teacher key and preparation',2);d.add_paragraph(item['teacher'])
 d.save(path)
def write_guide(path,module):
 d=Document();s=d.sections[0];s.orientation=WD_ORIENT.LANDSCAPE;s.page_width=Inches(11);s.page_height=Inches(8.5)
 s.top_margin=s.bottom_margin=Inches(.45);s.left_margin=s.right_margin=Inches(.5)
 attribution_footer(d)
 normal=d.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(9);normal.paragraph_format.space_after=Pt(3)
 d.add_heading(module['META']['titleDoc'],0)
 d.add_paragraph('Compact teacher guide • OpenAI-only curriculum draft • teacher review copy')
 u=module['UNIT']
 for label,key in [('Duration','totalDuration'),('Driving question','drivingQuestion'),('Source learning outcomes','learningOutcomes')]:d.add_heading(label,2);d.add_paragraph(u[key])
 d.add_heading('Preparation and evidence',2);d.add_paragraph('Use the companion Student Materials and Materials Teacher Key. Card identifiers are local references,not web links. Practical demonstrations require the teacher’s local risk assessment. Standard CBE documents and structured JSON are supplied with the accepted unit after content review. Consult the unit review record for independent review and classroom confirmation status.')
 for l in module['LESSONS']:
  d.add_page_break();d.add_heading(f'Lesson {l["number"]}: {l["title"]}',1)
  d.add_paragraph('40 minutes • '+l['slo']['purpose'])
  d.add_paragraph('Knowledge: '+l['slo']['knowledge'])
  d.add_paragraph('Preparation/safety: '+l['slo']['safetyNotes'])
  table=d.add_table(rows=1,cols=5);table.style='Table Grid';table.autofit=False
  for c,w in zip(table.columns,[1,2.2,2.9,1.8,2.1]):c.width=Inches(w)
  for c,t in zip(table.rows[0].cells,['Phase / time','Learner activity','Teacher moves','Sensemaking','Evidence / check']):c.text=t
  table.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
  for phase in l['framework']:
   cells=table.add_row().cells
   for c,t in zip(cells,[phase['phase'],phase['learnerExperience'],phase['teacherMoves'],phase['sensemakingStrategy'],phase['formativeAssessment']]):c.text=t
  d.add_paragraph('Reflection: '+l['teacherReflection'])
 d.save(path)
def write_student_summary(path,module):
 """Supply the blank student counterpart promised by the standard summary."""
 d=Document();s=d.sections[0]
 s.orientation=WD_ORIENT.LANDSCAPE;s.page_width=Inches(11);s.page_height=Inches(8.5)
 s.top_margin=s.bottom_margin=Inches(.65)
 s.left_margin=s.right_margin=Inches(.65)
 attribution_footer(d)
 normal=d.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10)
 d.add_heading(module['META']['titleDoc']+' — Student Summary Table',0)
 d.add_paragraph('Complete the three evidence columns after each lesson. Use your own observations, learning and explanation. Teacher exemplars are supplied separately.')
 table=d.add_table(rows=1,cols=4);table.style='Table Grid'
 for c,t in zip(table.rows[0].cells,['Lesson','What I observed','What I learned','What I can explain']):c.text=t
 table.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
 for l in module['LESSONS']:
  row=table.add_row();row.cells[0].text=f'{l["number"]}. {l["title"]}'
  row.height=Inches(.45)
 d.save(path)
def build(name):
 m=json.loads((BASE/'manuscripts'/f'{name}.json').read_text())
 bp=json.loads((BASE/'blueprints'/f'{name}.json').read_text())
 bank=json.loads((BASE/'materials'/f'{name}.json').read_text())
 requirements=json.loads((BASE/'sources'/f'{name}.json').read_text())
 errors=[];checks=[]
 for c in bank['calculations']:
  actual=calc(c['expression']);ok=math.isclose(actual,c['expected'],rel_tol=c.get('relative_tolerance',1e-8),abs_tol=c.get('absolute_tolerance',1e-8))
  checks.append({**c,'actual':actual,'pass':ok})
  if not ok:errors.append('Calculation '+c['id'])
 values={c['id']:c['actual'] for c in checks}
 def resolve(x):
  if isinstance(x,str):
   return re.sub(r'\{\{([^}:]+):([^}]+)\}\}',lambda z:format(values[z[1]],z[2]),x)
  if isinstance(x,list):return [resolve(v) for v in x]
  if isinstance(x,dict):return {k:resolve(v) for k,v in x.items()}
  return x
 m=resolve(m);bank=resolve(bank)
 cards={x['id']:x for x in bank['items']}
 all_outcomes={x['id'] for x in requirements['outcomes']}
 taught=set();assessed=set();lessons=[]
 for i,l in enumerate(m['lessons'],1):
  assert l['number']==i
  if sum(l['minutes'])!=40 or len(l['minutes'])!=5:errors.append(f'L{i} pacing')
  if len(l['phases'])!=5:errors.append(f'L{i} phase count')
  if not set(l['materials'])<=set(cards):errors.append(f'L{i} missing material')
  if not set(l['outcomes'])<=all_outcomes:errors.append(f'L{i} unknown outcome')
  taught.update(l['outcomes'])
  materials='; '.join(l['materials'])
  fw=[]
  for j,(p,mins) in enumerate(zip(l['phases'],l['minutes'])):
   if len(p)!=4 or any(not t.strip() for t in p):errors.append(f'L{i} phase {j} missing cell')
   fw.append(dict(phase=PHASES[j],learnerExperience=p[0],teacherMoves=f'{mins} minutes. '+p[1],sensemakingStrategy=p[2],formativeAssessment=p[3]))
  lessons.append(dict(number=i,title=l['title'],duration='40 minutes',substrand=m['unit']['substrand'],aresKeywords=l.get('aresKeywords',m['topic']),
   slo=dict(purpose=l['purpose'],knowledge=l['knowledge'],skills=l['skills'],attitudes=l['attitudes'],keyInquiry=l['inquiry'],purposeInStoryline=l['story'],safetyNotes=l['safety']),
   overview=l['overview']+'\nMaterials: '+materials+'. Use the companion Student Materials and Teacher Materials Key. Pacing: '+', '.join(f'{p.replace(" Phase","")} {v} min' for p,v in zip(PHASES,l['minutes']))+'.',
   framework=fw,teacherReflection=l['reflection'],summaryTablePrompt=l['summary']))
 for a in bp['assessment_map']:assessed.update(a['outcomes'])
 if taught!=all_outcomes:errors.append('Teaching coverage '+str(all_outcomes-taught))
 if assessed!=all_outcomes:errors.append('Assessment coverage '+str(all_outcomes-assessed))
 if bp['lesson_count']!=len(lessons):errors.append('Blueprint count')
 for x in bp['lesson_map']:
  if x['outcomes']!=m['lessons'][x['lesson']-1]['outcomes']:errors.append('Blueprint outcome mismatch')
 meta=dict(subject=m['subject'],grade=10,substrand_id=m['substrand_id'],substrand_name=m['topic'],outputDir=f'v2/{m["folder"]}/SS{m["substrand_id"]}_{m["topic"].replace(" ","_").replace(",","")}',filePrefix=m['prefix'],titleDoc=f'{m["subject"].upper()} GRADE 10: {m["topic"].upper()}',subtitleDoc=f'OpenAI-only evaluation • Sub-Strand {m["substrand_id"]} • {len(lessons)} lessons • teacher review copy')
 # These named authoring notes remain in the fingerprinted canonical records.
 # They are not fields in the strict R1 export contract. Other unknown keys
 # deliberately remain visible to the normal contract gate rather than being
 # silently discarded by a broad allowlist.
 unit_notes={'keyInquiryQuestions','teacherConfirmationRequired'}
 unit={**{k:v for k,v in m['unit'].items() if k not in unit_notes},'gradeLevel':'10','subject':m['subject'],'totalDuration':f'{len(lessons)} lessons × 40 minutes = {len(lessons)*40} minutes','learningOutcomes':'\n'.join(x['text'] for x in requirements['outcomes'])}
 st=dict(subStrand=unit['substrand'],drivingQuestion=unit['drivingQuestion'],lessons=[dict(number=l['number'],title=l['title'],**l['summaryTablePrompt']) for l in lessons])
 assessment={**m['assessment'],'sections':[{k:v for k,v in section.items() if k!='marks'} for section in m['assessment']['sections']]}
 module=dict(schemaVersion='1.1.0',META=meta,UNIT=unit,LESSONS=lessons,FINAL_EXPLANATION=assessment,SUMMARY_TABLE=st)
 if errors:raise ValueError(errors)
 out=BASE/'modules'/f'{name}_data.js';out.parent.mkdir(parents=True,exist_ok=True);out.write_text("'use strict';\nmodule.exports = "+json.dumps(module,ensure_ascii=False,indent=2)+';\n')
 report={'module':name,'lessons':len(lessons),'minutes':len(lessons)*40,'calculations':checks,'covered_outcomes':sorted(taught),'assessment_outcomes':sorted(assessed),'errors':errors,'scope':'Arithmetic of registered checks, record coverage and structure only; does not prove factual or pedagogical correctness.'}
 (BASE/'evidence').mkdir(parents=True,exist_ok=True)
 (BASE/'evidence'/f'{name}_checks.json').write_text(json.dumps(report,indent=2))
 if errors:raise ValueError(errors)
 outdir=BASE/'outputs'/meta['outputDir'];outdir.mkdir(parents=True,exist_ok=True)
 student_items=bank['items']
 if bp.get('isolate_final_materials'):
  teaching_ids={card for lesson in m['lessons'][:-1] for card in lesson['materials']}
  final_only=set(m['lessons'][-1]['materials'])-teaching_ids
  student_items=[card for card in bank['items'] if card['id'] not in final_only]
 write_doc(outdir/(m['prefix']+'_StudentMaterials.docx'),m['topic']+' — Student Materials',student_items)
 write_doc(outdir/(m['prefix']+'_MaterialsTeacherKey.docx'),m['topic']+' — Materials Teacher Key',bank['items'],True)
 write_doc(outdir/(m['prefix']+'_AssessmentMaterials.docx'),m['topic']+' — Independent Assessment Materials',[cards[c] for c in m['lessons'][-1]['materials']])
 write_guide(outdir/(m['prefix']+'_CompactTeacherGuide.docx'),module)
 write_student_summary(outdir/(m['prefix']+'_StudentSummaryTable.docx'),module)
 return report
if __name__=='__main__':
 import sys
 for name in sys.argv[1:]:
  r=build(name);print(name,r['lessons'],'lessons;',len(r['calculations']),'registered calculations checked')
