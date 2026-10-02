#!/usr/bin/env python3
"""Cross-checks the app code against the migrated database schema.

Finds every place the code touches the database -- .from('table') with its
.insert/.update/.upsert keys and simple .select column lists, .rpc('fn'), and
.storage.from('bucket') -- in src/ and supabase/functions/, and verifies each
table, column, function and bucket actually exists. This is the class of bug
behind "profiles.bio", the missing "avatars" bucket, and admin_notes on
events/questionnaires: the code wrote to something the schema never had, and
PostgREST rejected the whole request.

Usage: run after the migrations are applied (db-tests/run.sh does this):
  PSQL="psql -d bl_test" python3 db-tests/schema_crosscheck.py
Exits non-zero if anything is missing.
"""
import re, glob, os, subprocess, sys, shlex

PSQL = shlex.split(os.environ.get('PSQL', 'psql -d bl_test'))
def q(sql):
    out = subprocess.run(PSQL + ['-Atc', sql], capture_output=True, text=True, check=True).stdout
    return set(l.strip() for l in out.splitlines() if l.strip())

cols = q("select table_name||'.'||column_name from information_schema.columns where table_schema='public'")
tables = q("select table_name from information_schema.tables where table_schema='public'")
funcs = q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
buckets = q("select id from storage.buckets")
files=[f for f in glob.glob('src/**/*.ts*',recursive=True)+glob.glob('supabase/functions/*/index.ts') if '__tests__' not in f and 'demo-data' not in f]
problems=[]; checked={'tables':0,'write_cols':0,'select_cols':0,'rpc':0,'buckets':0}

def top_level_keys(obj):
    # keys of a JS object literal at depth 1
    keys=[]; depth=0; i=0; token=''
    s=obj[1:-1] if obj.startswith('{') else obj
    parts=[]; cur=''; d=0
    for ch in s:
        if ch in '{[(': d+=1
        elif ch in '}])': d-=1
        if ch==',' and d==0: parts.append(cur); cur=''
        else: cur+=ch
    parts.append(cur)
    for p in parts:
        p=p.strip()
        if not p or p.startswith('...'): continue
        m=re.match(r"['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*:", p)
        if m: keys.append(m.group(1))
        elif re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', p): keys.append(p)   # shorthand
    return keys

def grab_balanced(src, start):
    # src[start] should be '{' ; return the balanced literal
    d=0
    for j in range(start, min(len(src), start+6000)):
        if src[j]=='{': d+=1
        elif src[j]=='}':
            d-=1
            if d==0: return src[start:j+1]
    return None

def strip_comments(text):
    # Remove /* */ blocks and whole-line // comments (keeps line numbers), so a
    # comment between .from('x') and .select(...) can't hide the chain. Inline
    # // after code is left alone to avoid touching URLs inside strings.
    text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
    return '\n'.join('' if l.lstrip().startswith('//') else l for l in text.split('\n'))

for f in files:
    src=strip_comments(open(f).read())
    for m in re.finditer(r"""\.from\(\s*['"]([a-z_]+)['"]\s*\)""", src):
        table=m.group(1); line=src[:m.start()].count('\n')+1
        before=src[max(0,m.start()-40):m.start()]
        if 'storage' in before[-20:]:
            checked['buckets']+=1
            if table not in buckets: problems.append(f"{f}:{line}  storage bucket '{table}' does not exist")
            continue
        checked['tables']+=1
        if table not in tables:
            problems.append(f"{f}:{line}  table '{table}' does not exist"); continue
        chain=src[m.end():m.end()+700]
        wm=re.match(r"\s*\.(insert|update|upsert)\(\s*(\{)", chain)
        if wm:
            lit=grab_balanced(src, m.end()+wm.start(2))
            if lit:
                for k in top_level_keys(lit):
                    checked['write_cols']+=1
                    if f"{table}.{k}" not in cols: problems.append(f"{f}:{line}  {wm.group(1)} into {table}: column '{k}' does not exist")
        sm=re.match(r"\s*\.select\(\s*['`\"]([^'`\"]*)['`\"]", chain)
        if sm and '${' not in sm.group(1):
            sel=sm.group(1)
            # strip embedded resources  name:rel(...)  rel!inner(...)  rel(...)
            depth=0; flat=''
            for ch in sel:
                if ch=='(': depth+=1; continue
                if ch==')': depth-=1; continue
                if depth==0: flat+=ch
            for c in [x.strip() for x in flat.split(',')]:
                if not c or c=='*' or ':' in c or '!' in c or '.' in c: continue
                if not re.match(r'^[a-z_][a-z0-9_]*$', c): continue
                # an embedded relation name (followed by '(' originally) - skip if it is a table
                if c in tables: continue
                checked['select_cols']+=1
                if f"{table}.{c}" not in cols: problems.append(f"{f}:{line}  select from {table}: column '{c}' does not exist")
    for m in re.finditer(r"""\.rpc\(\s*['"]([a-z_]+)['"]""", src):
        checked['rpc']+=1
        if m.group(1) not in funcs: problems.append(f"{f}:{src[:m.start()].count(chr(10))+1}  rpc function '{m.group(1)}' does not exist")
print(f"schema cross-check: {checked['tables']} table refs, {checked['write_cols']} written columns, {checked['select_cols']} selected columns, {checked['rpc']} RPCs, {checked['buckets']} buckets")
if problems:
    print(f"{len(set(problems))} PROBLEM(S): code uses something the database doesn't have")
    for p in sorted(set(problems)): print('  ', p)
    sys.exit(1)
print('schema cross-check: OK')
