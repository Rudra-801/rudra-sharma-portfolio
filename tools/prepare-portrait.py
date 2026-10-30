from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort
import pooch
from scipy import ndimage

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/portraits'
source = Image.open(folder / 'rudra-original.png').convert('RGB')
model = pooch.retrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx', known_hash='md5:c09ddc2e0104f800e3e1bb4652583d1f', path=root/'artifacts', fname='u2net_human_seg.onnx')
options = ort.SessionOptions()
options.intra_op_num_threads = 4
session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
region = (345, 255, 800, 1335)
subject = source.crop(region)
pixels = np.asarray(subject.resize((320,320), Image.Resampling.LANCZOS), dtype=np.float32)
pixels = pixels / np.max(pixels)
pixels = (pixels - np.array([.485,.456,.406])) / np.array([.229,.224,.225])
prediction = session.run(None, {session.get_inputs()[0].name: pixels.transpose(2,0,1)[None].astype(np.float32)})[0][0,0]
prediction = (prediction-prediction.min())/(prediction.max()-prediction.min())
mask = Image.new('L', source.size)
mask.paste(Image.fromarray((prediction*255).astype('uint8')).resize(subject.size,Image.Resampling.LANCZOS), region[:2])
alpha = np.array(mask)
# Drop disconnected background islands, preserving the detected person component.
labels, count = ndimage.label(alpha > 30)
sizes = np.bincount(labels.ravel())
sizes[0] = 0
person = labels == sizes.argmax()
person = ndimage.binary_dilation(person, iterations=2)
alpha[~person] = 0
# Suppress only lawn-coloured background pixels within the mask boundary.
# Clothing/skin RGB is never repainted, retouched or reconstructed.
rgb = np.asarray(source, dtype=np.float32)
edge = ndimage.distance_transform_edt(alpha > 30) < 8
lawn = (rgb[:,:,1] > rgb[:,:,0]*1.025) & (rgb[:,:,1] > rgb[:,:,2]*1.16)
alpha[edge & lawn] = 0
refined = np.array(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)))
alpha[445:] = refined[445:]
alpha[alpha > 245] = 255
rgba = source.convert('RGBA')
rgba.putalpha(Image.fromarray(alpha))
bounds = rgba.getbbox()
bounds = (max(0,bounds[0]-8), max(0,bounds[1]-8), min(source.width,bounds[2]+8), min(source.height,bounds[3]+8))
full = rgba.crop(bounds)
full.save(folder / 'rudra-full.png', optimize=True)
full.save(folder / 'rudra-full.webp', lossless=True, method=6)
mobile = full.crop((0, 0, full.width, round(full.height * .56)))
mobile.save(folder / 'rudra-upper.webp', lossless=True, method=6)
small = mobile.copy()
small.thumbnail((300, 600), Image.Resampling.LANCZOS)
small.save(folder / 'rudra-upper-300.webp', lossless=True, method=6)
config = {'src':'assets/portraits/rudra-full.png','alt':'Rudra Sharma','width':full.width,'height':full.height,'mobileWidth':mobile.width,'mobileHeight':mobile.height,'crop':bounds,'source':'assets/portraits/rudra-original.png','method':'Non-generative person segmentation; original RGB pixels with alpha mask only. Lossless WebP.'}
(root/'assets/portrait-config.json').write_text(json.dumps(config,indent=2)+'\n')
bg = Image.new('RGBA',full.size, '#0b0c0c')
bg.alpha_composite(full)
bg.convert('RGB').save(root/'artifacts/portrait-edge-review.jpg',quality=96)
print(json.dumps(config))
print({p.name:p.stat().st_size for p in folder.iterdir()})
