// frontend/tests/e2e/workflows/support/workflow-constants.js

/**
 * TENET 워크플로우 테스트를 위한 테스트 데이터 설정
 */
export const testWorkflow = {
  name: 'TENET',
  expectedFile: 'pbmc_light_1000.h5ad',
  folder: 'data',
  // TENET 템플릿의 실제 InputFile 노드 이름
  inputNodeName: 'Input h5ad', // 모달을 열기 위한 노드 제목
  inputNodeTabName: 'input.h5ad', // 소문자와 점으로 표시되는 탭 텍스트
};

/**
 * 타임스탬프와 랜덤 ID를 사용하여 고유 파일명 생성
 * @param {string} baseFileName - 기본 파일명 (예: 'test_data.h5ad')
 * @returns {string} 고유 파일명 (예: 'test_data_1234567890_abc123.h5ad')
 */
export function generateUniqueFileName(baseFileName) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const lastDot = baseFileName.lastIndexOf('.');
  if (lastDot === -1) {
    return `${baseFileName}_${timestamp}_${randomId}`;
  }
  const name = baseFileName.substring(0, lastDot);
  const extension = baseFileName.substring(lastDot);
  return `${name}_${timestamp}_${randomId}${extension}`;
}

/**
 * 타임스탬프와 랜덤 ID를 사용하여 고유 워크플로우 제목 생성
 * @param {string} baseTitle - 기본 제목 (기본값: 'Test Workflow')
 * @returns {string} 고유 제목 (예: 'Test Workflow_1234567890_abc123')
 */
export function generateUniqueWorkflowTitle(baseTitle = 'Test Workflow') {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${baseTitle}_${timestamp}_${randomId}`;
}
