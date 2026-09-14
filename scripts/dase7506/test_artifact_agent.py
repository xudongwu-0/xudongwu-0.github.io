import importlib.util,io,json,pickle,tempfile,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('agent',Path(__file__).with_name('check-artifacts.py'))
agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)

def torch_archive(payload):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:z.writestr('archive/data.pkl',payload)
    return stream.getvalue()

class AgentTests(unittest.TestCase):
    def test_inspection_does_not_execute_code_or_claim_score_reproduction(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'student.py').write_text('raise RuntimeError("must not execute")\ndef build_model(config): pass\ndef predict_log_probs(ids): pass\n')
            ckpt=root/'checkpoint.pt';ckpt.write_bytes(torch_archive(pickle.dumps({'protocol':agent.PROTOCOL,'model':{},'config':{}})))
            report=agent.inspect_entry({'submission':1,'author':'test'},root,ckpt)
            self.assertEqual(report['status'],'files-checked')
            self.assertFalse(report['score_reproduced'])
            self.assertFalse(report['checks']['code']['student_code_executed'])
    def test_checkpoint_pickle_is_inspected_without_unpickling(self):
        payload=b"cos\nsystem\n(S'raise-would-execute-if-unpickled'\ntR."
        result=agent.inspect_checkpoint(torch_archive(payload))
        self.assertFalse(result['protocol_found'])
        self.assertFalse(result['checkpoint_executed'])
    def test_invalid_checkpoint_and_nonpublic_urls_are_flagged(self):
        self.assertEqual(agent.inspect_checkpoint(b'<html>not a checkpoint</html>')['format'],'unknown')
        for url in ['http://example.org/file','https://127.0.0.1/file','https://user:pass@example.org/file']:
            with self.assertRaises(ValueError):agent.public_url(url)
if __name__=='__main__':unittest.main()
