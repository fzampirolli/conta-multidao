"""Exporta o modelo DM-Count (pesos UCF-QNRF, via pacote lwcc) para ONNX
e gera uma versão quantizada (int8) leve para rodar no navegador.

Uso:  python python/exportar_onnx.py
Saída: docs/modelos/dmcount_qnrf.onnx  e  docs/modelos/dmcount_qnrf_int8.onnx
"""
import os
import torch
from lwcc.models import DMCount
from onnxruntime.quantization import quantize_dynamic, QuantType

SAIDA = os.path.join(os.path.dirname(__file__), "..", "docs", "modelos")
os.makedirs(SAIDA, exist_ok=True)
fp32 = os.path.join(SAIDA, "dmcount_qnrf.onnx")
int8 = os.path.join(SAIDA, "dmcount_qnrf_int8.onnx")

modelo = DMCount.make_model("QNRF").eval()
x = torch.randn(1, 3, 512, 512)
torch.onnx.export(modelo, x, fp32, input_names=["imagem"], output_names=["densidade"],
                  dynamic_axes={"imagem": {2: "h", 3: "w"}, "densidade": {2: "h8", 3: "w8"}},
                  opset_version=17, dynamo=False)
quantize_dynamic(fp32, int8, weight_type=QuantType.QUInt8)
for f in (fp32, int8):
    print(f, f"{os.path.getsize(f)/1e6:.1f} MB")
