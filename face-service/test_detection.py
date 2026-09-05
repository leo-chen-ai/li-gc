import unittest
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
import app as service


class DetectionTest(unittest.TestCase):
    def test_recognition_top_three_even_below_threshold(self):
        library = {
            str(i): {"name": f"测试人员{i}", "embedding": np.array([score, 0], np.float32)}
            for i, score in enumerate([0.1, 0.3, -0.1, 0.2])
        }
        with patch.object(service, 'decode_image', return_value=(np.zeros((10, 10, 3)), None)), \
             patch.object(service, 'analyze_face', return_value=(np.array([1, 0]), None, {})), \
             patch.object(service, 'load_library', return_value=library):
            client = service.app.test_client()
            result = client.post('/api/recognize', json={'project_id': 'test', 'image': 'mock', 'threshold': 0.45}).get_json()
            self.assertFalse(result['matched'])
            self.assertEqual(result['reason'], 'low_score')
            self.assertEqual([v['score'] for v in result['candidates']], [0.3, 0.2, 0.1])
            self.assertEqual([v['name'] for v in result['candidates']], ['测试人员1', '测试人员3', '测试人员0'])
            library.pop('0')
            library.pop('2')
            result = client.post('/api/recognize', json={'project_id': 'test', 'image': 'mock', 'threshold': 0.25}).get_json()
            self.assertTrue(result['matched'])
            self.assertEqual(result['person_id'], '1')
            self.assertEqual(len(result['candidates']), 2)
            library.clear()
            result = client.post('/api/recognize', json={'project_id': 'test', 'image': 'mock'}).get_json()
            self.assertEqual(result['candidates'], [])
            self.assertEqual(result['reason'], 'empty_library')

    def outputs(self):
        counts = [12800, 3200, 800]
        return ([np.zeros((n, 1), np.float32) for n in counts]
                + [np.ones((n, 4), np.float32) for n in counts]
                + [np.zeros((n, 10), np.float32) for n in counts])

    def detect(self, outputs):
        session = SimpleNamespace(run=lambda *args: outputs,
                                  get_inputs=lambda: [SimpleNamespace(name='input')])
        with patch.object(service, 'ensure_models'), patch.object(service, '_det_session', session):
            return service.detect_faces(np.zeros((640, 640, 3), np.uint8))

    def test_reduced_input_maps_boxes_and_landmarks_back_to_original(self):
        outputs = self.outputs()
        outputs[2][414] = 0.9
        session = SimpleNamespace(run=lambda *args: outputs,
                                  get_inputs=lambda: [SimpleNamespace(name='input')])
        with patch.object(service, 'ensure_models'), patch.object(service, '_det_session', session):
            faces = service.detect_faces(np.zeros((640,640,3), np.uint8), input_scale=0.75)
        np.testing.assert_allclose(faces[0][0][:4], np.array([192,288,256,352]) / 0.75, rtol=1e-6)
        np.testing.assert_allclose(faces[0][1], np.array([[224,320]] * 5) / 0.75, rtol=1e-6)

    def test_empty_frame_has_only_one_bounded_retry_at_same_threshold(self):
        scales = []
        def detect(image, diagnostics, input_scale=1.0):
            scales.append(input_scale)
            diagnostics.update(detection_peak_score=0.1, detection_threshold=0.30)
            return []
        with patch.object(service, 'ensure_models'), patch.object(service, 'detect_faces', side_effect=detect):
            embedding, _, info = service.analyze_face(np.zeros((100,100,3), np.uint8))
        self.assertIsNone(embedding)
        self.assertEqual(scales, [1.0,0.75])
        self.assertEqual(info['detection_threshold'], 0.30)
        self.assertEqual(len(info['detection_attempts']), 2)

    def test_second_anchor_at_stride_32_does_not_overflow(self):
        outputs = self.outputs()
        outputs[2][414] = 0.9
        faces = self.detect(outputs)
        self.assertEqual(len(faces), 1)
        # Prediction 414 is grid cell 207: x=7*32, y=10*32.
        np.testing.assert_allclose(faces[0][0][:4], [192, 288, 256, 352])
        np.testing.assert_allclose(faces[0][1], [[224, 320]] * 5)

    def test_empty_frame_returns_no_faces(self):
        self.assertEqual(self.detect(self.outputs()), [])

    def test_detection_threshold_and_diagnostics(self):
        outputs = self.outputs()
        outputs[2][414] = 0.32
        session = SimpleNamespace(run=lambda *args: outputs,
                                  get_inputs=lambda: [SimpleNamespace(name='input')])
        with patch.object(service, 'ensure_models'), patch.object(service, '_det_session', session):
            info = {}
            img = np.zeros((640, 640, 3), np.uint8)
            self.assertEqual(len(service.detect_faces(img, diagnostics=info)), 1)
            self.assertEqual(info['detection_threshold'], 0.30)
            self.assertEqual(info['detection_peak_score'], 0.32)
            self.assertEqual(info['face_count'], 1)
            self.assertEqual(service.detect_faces(img, score_threshold=0.35), [])

    def test_crop_keeps_margin_clamps_edges_and_translates_landmarks(self):
        img = np.zeros((100, 100, 3), np.uint8)
        kps = np.array([[30, 30], [40, 30], [35, 40], [30, 50], [40, 50]])
        crop, translated = service.crop_face(img, [20, 20, 60, 60, 0.9], kps)
        self.assertEqual(crop.shape, (56, 56, 3))
        np.testing.assert_array_equal(translated, kps - [12, 12])
        crop, _ = service.crop_face(img, [-20, -20, 110, 110, 0.9], kps)
        self.assertEqual(crop.shape, img.shape)
        crop, _ = service.crop_face(img, [200, 200, 210, 210, 0.9], kps)
        self.assertIsNone(crop)

    def test_last_anchor_on_every_scale(self):
        for index, stride in enumerate([8, 16, 32]):
            with self.subTest(stride=stride):
                outputs = self.outputs()
                outputs[index][-1] = 0.9
                faces = self.detect(outputs)
                self.assertEqual(len(faces), 1)
                center = 640 - stride
                np.testing.assert_allclose(
                    faces[0][0][:4],
                    [center - stride, center - stride, 640, 640],
                )

    def test_nms_receives_width_height_not_bottom_right_coordinates(self):
        outputs = self.outputs()
        outputs[2][414] = 0.9
        with patch.object(service.cv2.dnn, 'NMSBoxes', return_value=[0]) as nms:
            self.detect(outputs)
        np.testing.assert_allclose(nms.call_args.args[0], [[192, 288, 64, 64]])


if __name__ == '__main__':
    unittest.main()
