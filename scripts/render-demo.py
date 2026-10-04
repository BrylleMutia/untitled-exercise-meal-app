"""Render recorded local browser chapters into a captioned 1080p product tour."""
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import wave
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results' / 'demo'
sys.path.insert(0, str(ROOT / 'test-results' / 'demo-tools'))
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
REUSE_CLIPS = '--reuse-clips' in sys.argv
INK, MUTED, CREAM, LAV, MINT, PEACH = '#262836', '#72768d', '#f6f5fa', '#cbc3ee', '#d7efe9', '#fce7d1'
FONT = Path('C:/Windows/Fonts')

def font(size, bold=False):
    return ImageFont.truetype(str(FONT / ('seguisb.ttf' if bold else 'segoeui.ttf')), size)

def text(draw, xy, value, size=32, bold=False, fill=INK):
    draw.text(xy, value, font=font(size, bold), fill=fill)

def wrap(draw, value, size, width):
    lines, current = [], ''
    for word in value.split():
        trial = (current + ' ' + word).strip()
        if draw.textlength(trial, font=font(size)) > width and current:
            lines.append(current)
            current = word
        else:
            current = trial
    return lines + [current]

def poster(filename, outro=False):
    image = Image.new('RGB', (1920,1080), CREAM)
    draw = ImageDraw.Draw(image)
    draw.ellipse((1390,-210,2180,580),fill=LAV)
    draw.ellipse((-320,730,410,1460),fill=MINT)
    text(draw,(145,110),'CALI',36,True)
    text(draw,(145,245),'A little structure.',106,True)
    text(draw,(145,370),'More room for life.',106,True)
    text(draw,(150,535),'Exercise and meal planning for your everyday routine.',38)
    cards = [('Plan your week',LAV),('Move your way',MINT),('Log and reflect',PEACH)]
    for i,(label,color) in enumerate(cards):
        x=150+i*540
        draw.rounded_rectangle((x,665,x+500,820),radius=32,fill=color)
        text(draw,(x+35,710),label,34,True)
    text(draw,(150,905),'YOUR PLAN. YOUR PACE.' if outro else 'A guided tour · desktop + mobile',30,True)
    text(draw,(150,985),'Sample data shown. Health, food targets and energy values are estimates.',23,fill=MUTED)
    image.save(OUT / f'{filename}.png')

def banner(chapter):
    image = Image.new('RGBA',(1920,1080),(0,0,0,0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0,0,1920,72),fill=CREAM)
    draw.rectangle((0,1008,1920,1080),fill=CREAM)
    text(draw,(48,14),'CALI',32,True)
    text(draw,(205,18),f'{chapter["index"]:02d}  /  {chapter["title"]}',26,True)
    text(draw,(1570,25),'DEMO · SAMPLE DATA',17,True,fill=MUTED)
    lines=wrap(draw,chapter['caption'],25,1810)
    if len(lines)>2:
        raise ValueError('Caption is too long')
    for i,line in enumerate(lines):
        text(draw,(48,1015+i*29),line,25)
    if chapter['mobile']:
        draw.rectangle((0,72,1920,1008),fill=CREAM)
        draw.rounded_rectangle((320,105,730,985),radius=35,fill=INK)
        draw.rectangle((330,123,720,967),fill=(0,0,0,0))
        text(draw,(870,260),'Fits into your day.',68,True)
        for i,(heading,body) in enumerate([
            ('One plan, everywhere','The same saved meals, workouts and history.'),
            ('Quick, reachable actions','Log food, steps and activity from Home.'),
            ('A calm daily rhythm','Clear progress, optional gentle motivation.')]):
            y=430+i*155
            draw.ellipse((875,y+12,892,y+29),fill=LAV)
            text(draw,(915,y),heading,34,True)
            text(draw,(915,y+53),body,26,fill=MUTED)
    image.save(OUT / f'{chapter["index"]:02d}-banner.png')

def run(args):
    result=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-filter_complex_threads','1','-filter_threads','1',*map(str,args)],capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)

def encode_poster(name,seconds):
    output=OUT / f'{name}.mp4'
    if REUSE_CLIPS and output.exists():
        return output
    run(['-loop','1','-i',OUT/f'{name}.png','-t',seconds,'-vf','fps=25,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st='+str(seconds-.4)+':d=0.4','-c:v','libx264','-preset','fast','-crf','21','-threads','2','-an',output])
    return output

def ambient():
    # Original, quiet synthesized pad. No samples, songs, or licensed recordings.
    path=OUT/'ambient.wav'
    sample_rate=22050
    chords=[(130.813,164.814,195.998),(110.,146.832,174.614),(87.307,130.813,174.614),(97.999,146.832,195.998)]
    with wave.open(str(path),'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        for second in range(64):
            samples=bytearray()
            for j in range(sample_rate):
                t=second+j/sample_rate
                chord_index=int(t//4)%len(chords)
                phase=t%4
                envelope=min(1,phase/0.8,(4-phase)/0.8)
                value=sum(math.sin(2*math.pi*f*t)*.6+math.sin(2*math.pi*f*2*t)*.15 for f in chords[chord_index])/3
                samples.extend(struct.pack('<h',int(value*envelope*1800)))
            stream.writeframes(samples)
    return path

chapters=json.loads((OUT/'chapters.json').read_text())
if [c['index'] for c in chapters] != list(range(1,19)):
    raise RuntimeError('All 18 chapters must be recorded before rendering.')
poster('intro')
poster('outro',True)
clips=[encode_poster('intro',7)]
timeline=[{'title':'Welcome to Cali','start':0,'duration':7}]
clock=7
for chapter in chapters:
    banner(chapter)
    number=chapter['index']
    rendered=OUT/f'{number:02d}.mp4'
    duration=round(chapter['duration'],2)
    if chapter['mobile']:
        filter_graph='[0:v]scale=390:844,pad=1920:1080:330:123:color=0xf6f5fa[app];[app][1:v]overlay=0:0'
    else:
        filter_graph='[0:v]scale=1664:936:flags=lanczos,pad=1920:1080:128:72:color=0xf6f5fa[app];[app][1:v]overlay=0:0'
    filter_graph+=f',fps=25,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st={max(0,duration-.25)}:d=0.25[v]'
    print(f'Rendering {number:02d}: {chapter["title"]}',flush=True)
    if not (REUSE_CLIPS and rendered.exists()):
        run(['-ss',round(chapter['start'],2),'-i',chapter['raw'],'-loop','1','-i',OUT/f'{number:02d}-banner.png','-t',duration,'-filter_complex',filter_graph,'-map','[v]','-c:v','libx264','-preset','fast','-crf','21','-threads','2','-an',rendered])
    clips.append(rendered)
    timeline.append({'title':chapter['title'],'caption':chapter['caption'],'start':clock,'duration':duration})
    clock+=duration
clips.append(encode_poster('outro',7))
timeline.append({'title':'Your plan. Your pace.','start':clock,'duration':7})
clock+=7
concat=OUT/'concat.txt'
concat.write_text('\n'.join("file '"+p.as_posix().replace("'","'\\''")+"'" for p in clips))
joined=OUT/'joined.mp4'
run(['-f','concat','-safe','0','-i',concat,'-c','copy',joined])
music=ambient()
final=OUT/'Cali-product-demo.mp4'
metadata=OUT/'chapters.ffmeta'
chapter_metadata=[';FFMETADATA1','title=Cali — Everyday Usability and Choice','comment=Local demonstration with sample data; estimates are not dietary or exercise care.']
for item in timeline:
    title=item['title'].replace('\\','\\\\').replace('=','\\=').replace(';','\\;').replace('#','\\#')
    chapter_metadata.extend(['[CHAPTER]','TIMEBASE=1/1000',f'START={round(item["start"]*1000)}',f'END={round((item["start"]+item["duration"])*1000)}',f'title={title}'])
metadata.write_text('\n'.join(chapter_metadata),encoding='utf8')
run(['-i',joined,'-stream_loop','-1','-i',music,'-f','ffmetadata','-i',metadata,'-map','0:v','-map','1:a','-map_metadata','2','-map_chapters','2','-c:v','copy','-c:a','aac','-b:a','96k','-af',f'afade=t=in:st=0:d=2,afade=t=out:st={clock-3}:d=3','-t',clock,'-movflags','+faststart',final])
(OUT/'timeline.json').write_text(json.dumps(timeline,indent=2))

def stamp(seconds):
    total,ms=divmod(round(seconds*1000),1000)
    h,remainder=divmod(total,3600)
    m,s=divmod(remainder,60)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
srt=[]
for i,item in enumerate(timeline):
    srt.extend([str(i+1),f'{stamp(item["start"])} --> {stamp(item["start"]+item["duration"])}',item.get('caption',item['title']),''])
(OUT/'Cali-product-demo.srt').write_text('\n'.join(srt),encoding='utf8')
notes=['# Cali product demo','',f'1080p MP4 · {clock/60:.1f} minutes · English chapter captions · original ambient audio','',
       'Recorded from the running app with a local demo account and sample data. No shared user data or credentials appear in the video.',
       'AI provider delivery, staging email delivery and automatic device step sync are not demonstrated as working integrations. Steps are entered manually.',
       'Health metrics, calorie targets and energy values are estimates. The rapid workout recording is a sample logging flow, not an exercise instruction video.','', '## Chapters','']
for item in timeline:
    seconds=int(item['start']);notes.append(f'- {seconds//60:02d}:{seconds%60:02d} — {item["title"]}')
notes+=['','## Recreate the demo','','1. Start Docker and the local Supabase stack.','2. Run `node scripts/run-demo-server.mjs`.','3. Run `node scripts/record-demo.mjs --fresh` to use a new local demo account.','4. Run this script with Pillow and imageio-ffmpeg available.','',
        'The demo account is kept locally for exploring the app. Its credentials are in ignored `playwright/.auth/demo-account.json`.',
        'Raw recordings and intermediate files are in ignored `test-results/demo`.','',
        'Exercise illustrations: Bryl Lim via @bryllim/workout-guide (CC BY-SA 4.0). Background audio is an original synthesized pad.']
(OUT/'README.md').write_text('\n'.join(notes),encoding='utf8')
print('Verifying complete video/audio decode and extracting chapter previews.',flush=True)
run(['-i',final,'-f','null','-'])
sheet=Image.new('RGB',(1280,5*215),CREAM)
sheet_draw=ImageDraw.Draw(sheet)
for i,item in enumerate(timeline):
    frame=OUT/f'preview-{i:02d}.png'
    run(['-ss',round(item['start']+min(5,item['duration']/2),2),'-i',final,'-frames:v','1',frame])
    thumb=Image.open(frame).convert('RGB').resize((320,180))
    x=(i%4)*320;y=(i//4)*215
    sheet.paste(thumb,(x,y))
    label=item['title']
    while sheet_draw.textlength(label,font=font(15))>306:
        label=label[:-2]+'…'
    text(sheet_draw,(x+7,y+185),label,15,True)
sheet.save(OUT/'chapter-preview.jpg',quality=90)
deliverables=ROOT/'demo-video'
deliverables.mkdir(exist_ok=True)
for name in ['Cali-product-demo.mp4','Cali-product-demo.srt','README.md','chapter-preview.jpg','intro.png']:
    shutil.copy2(OUT/name,deliverables/name)
print(f'Finished: {final} ({clock:.1f} seconds)',flush=True)
