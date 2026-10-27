"""Execute only trusted curated examples, never arbitrary student/generated code."""
from pathlib import Path
import json, subprocess, sys, sqlite3, unittest
ROOT=Path(__file__).resolve().parents[1]
def pack(subject,topic):
    script="const n=require('./Frontend/js/academic-notes.js');const [s,t]=JSON.parse(process.argv[1]);process.stdout.write(JSON.stringify(n.lookup(s,t)));"
    return json.loads(subprocess.check_output(['node','-e',script,json.dumps([subject,topic])],cwd=ROOT,text=True,encoding='utf-8'))
def run_python(content):
    return subprocess.check_output([sys.executable,'-c',content],cwd=ROOT,text=True,encoding='utf-8',timeout=5).strip()
class AcademicExamples(unittest.TestCase):
    def test_bfs_code_executes_the_displayed_graph(self):
        p=pack('Data Structures & Algorithms','Graph Traversals Algorithms: Breadth First Search and Depth First Search')
        self.assertEqual(run_python(p['code']['text']),"['A', 'B', 'C', 'D']")
    def test_sorting_code_executes(self):
        p=pack('Data Structures & Algorithms','Sorting Algorithms: Insertion Sort, Quick sort & Merge sort.')
        output=run_python(p['code']['text'])
        self.assertEqual('[1, 2, 4, 5]',output)
    def test_python_control_flow_executes(self):
        p=pack('Python','Control statements: Decision and Loop Control Statements.')
        self.assertTrue(p)
        self.assertEqual(run_python(p['code']['text']),'9\n3\n2\n1')
    def test_sql_example_returns_the_documented_table(self):
        p=pack('Database Management Systems','SQL, DDL, and DML constructs')
        db=sqlite3.connect(':memory:')
        try:
            db.executescript(p['code']['text'])
            rows=db.execute('SELECT name, marks FROM Student WHERE marks >= 70 ORDER BY marks DESC').fetchall()
            self.assertEqual([[str(v) for v in row] for row in rows],p['tables'][0]['rows'])
            with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO Student VALUES (3,'Invalid',120)")
        finally:db.close()
    def test_inverse_and_kernel_example_arithmetic(self):
        p=pack('Mathematics-I','Inverse of a matrix');self.assertIn('[[1,−1],[−1,2]]',p['example'])
        a=[[2,1],[1,1]];inverse=[[1,-1],[-1,2]]
        product=[[sum(a[i][k]*inverse[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
        self.assertEqual(product,[[1,0],[0,1]])
        p=pack('Mathematics-I','Range and kernel of a linear map');self.assertIn('nullity=2',p['example'])
        for vector in [(-2,1,0),(-3,0,1)]:self.assertEqual(sum(x*y for x,y in zip([1,2,3],vector)),0)
if __name__=='__main__':unittest.main()
