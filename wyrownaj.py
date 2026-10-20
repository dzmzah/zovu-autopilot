# Время каждого слова в готовом дубле — для привязки текста к голосу.
#
#   python wyrownaj.py <dubel.wav> <wyjscie.json>
#
# Текст нам известен заранее, поэтому распознавание здесь нужно только ради
# ВРЕМЕНИ: ошибку в слове («czy» вместо «trzy») сопоставление в wyrownaj.mjs
# всё равно ставит на своё место.
#
# Сценарий подсказкой (initial_prompt) НЕ даём: на пробе 20.10 модель решила,
# что текст из подсказки уже прозвучал, и выбросила первые девять секунд.
import json
import os
import subprocess
import sys

import numpy as np

from faster_whisper import WhisperModel

plik, wyjscie = sys.argv[1], sys.argv[2]
model = WhisperModel(
    os.environ.get('WHISPER_MODEL', 'small'),
    device='cpu',
    compute_type='int8',
)
# Звук декодируем сами через ffmpeg: свежий PyAV (av 15+) ломает чтение
# внутри faster-whisper — «open() got an unexpected keyword argument
# 'metadata_errors'», сервер 20.10.
pcm = subprocess.run(
    ['ffmpeg', '-v', 'error', '-i', plik, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
    check=True, capture_output=True,
).stdout
dzwiek = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
segmenty, _ = model.transcribe(
    dzwiek,
    language='pl',
    word_timestamps=True,
    vad_filter=False,
    beam_size=5,
    condition_on_previous_text=False,
)
slowa = []
for s in segmenty:
    for w in s.words or []:
        t = w.word.strip()
        if t:
            slowa.append({'w': t, 'a': round(w.start, 3), 'b': round(w.end, 3)})
with open(wyjscie, 'w', encoding='utf-8') as f:
    json.dump(slowa, f, ensure_ascii=False)
