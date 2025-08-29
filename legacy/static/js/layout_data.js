// layout_data.js
// Formato compacto de layout: array de entradas [geomKey, px, py, pz, rx, ry, rz]
// - geomKey: string da geometria (nome do arquivo OBJ no manifest)
// - p*: posição em unidades da cena
// - r*: rotação em radianos (ordem XYZ)
// Observação: Os valores devem ser extraídos do estado final do app principal.
// Por ora, deixamos um placeholder vazio. Preencha com dados reais quando exportar.

export const LAYOUT_DATA = [
  // Exemplo:
  // ["D11C_CL.obj", 0, 10, 0, 0, 0, 0],
];
