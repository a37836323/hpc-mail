/**
 * 从 FileReader.readAsDataURL 的结果中剥离 `data:<mime>;base64,` 前缀，返回纯 base64。
 * 已是纯 base64（无前缀）时原样返回。
 */
export function stripDataUrlPrefix(value: string): string {
  if (!/^data:/i.test(value)) return value;
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}
