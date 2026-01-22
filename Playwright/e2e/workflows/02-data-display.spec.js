// frontend/tests/e2e/workflows/02-data-display.spec.js
import { test, expect } from '../fixtures/auth.js';
import { testWorkflow } from './support/workflow-constants.js';
import { setupPageObjects, setupTestFiles, cleanupTestFiles, createWorkflowWithUniqueTitle, cleanupWorkflows } from './support/workflow-setup.js';
import { getNodeFileAssignment, getWorkflowMetadata } from '../utils/workflow.js';

/**
 * 테스트 스위트: DataTable 노드 - 매트릭스 표시
 *
 * 이 테스트 스위트는 DataTable 노드 기능을 검증합니다:
 * - Drawflow 연결을 통한 InputFile에서 DataTable로의 파일 전파
 * - 매트릭스 데이터 로딩을 위한 백엔드 API 응답
 * - 적절한 컬럼과 행으로 테이블 렌더링
 * - 빈 상태 처리
 *
 * 성공 기준:
 * - 파일 할당이 연결을 통해 DataTable 노드로 전파됨
 * - 유효한 페이로드(컬럼과 행)로 API 호출 성공
 * - 빈 상태 없이 테이블 렌더링
 * - 행 수가 0보다 큼
 */
test.describe('DataTable 노드 - 매트릭스 표시', () => {
  test.describe.configure({ mode: 'serial' });

  let pageObjects;
  const uploadedFiles = [];
  const createdWorkflows = [];
  let currentTestFileName = null;
  let currentWorkflowTitle = null;

  test.beforeEach(async ({ page }) => {
    pageObjects = setupPageObjects(page);
    const { uploadedFileName } = await setupTestFiles(pageObjects.filesPage, testWorkflow, uploadedFiles);
    currentTestFileName = uploadedFileName;
    await pageObjects.projectsPage.goto();
    await pageObjects.projectsPage.verifyPageLoaded();
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestFiles(pageObjects.filesPage, uploadedFiles);
    await cleanupWorkflows(pageObjects.projectsPage, createdWorkflows);
  });

  /**
   * 테스트: DataTable 노드에 매트릭스 데이터가 표시되어야 함
   *
   * DataTable 기능 검증:
   * - InputFile 노드에 파일 할당
   * - 연결을 통해 DataTable로 파일 전파
   * - 데이터 로딩을 위한 API 호출
   * - 데이터로 테이블 렌더링
   */
  test('DataTable 노드에 매트릭스 데이터가 표시되어야 함', async ({ page }) => {
    test.setTimeout(60000);

    // 고유 제목으로 워크플로우 생성
    currentWorkflowTitle = await createWorkflowWithUniqueTitle(
      pageObjects.projectsPage,
      pageObjects.workflowPage,
      testWorkflow,
      createdWorkflows
    );

    await page.waitForSelector('.drawflow-node', { timeout: 10000 });

    // InputFile 노드에 파일 할당
    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);
    await pageObjects.inputFileModal.assignFile(testWorkflow.folder, currentTestFileName);

    // 나중에 DataTable에 집중하기 위해 InputFile 탭 닫기
    await pageObjects.workflowPage.closeTab(testWorkflow.inputNodeTabName);
    await page.waitForTimeout(300);

    // DOM에서 DataTable 노드 ID 결정 (없으면 알려진 기본값으로 폴백)
    const dataTableLocator = await pageObjects.workflowPage.findNodeByType('DataTable');
    const dataTableNodeIdAttr = await dataTableLocator.getAttribute('id');
    const dataTableNodeId = dataTableNodeIdAttr?.replace('node-', '') ?? '8';

    // 디버그: 폴링 전 워크플로우 drawflow 데이터 로그
    const metadataBefore = await getWorkflowMetadata(page);
    console.log(
      '📦 Vuex drawflow 데이터 (폴링 전):',
      JSON.stringify(metadataBefore?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    // Vuex 스토어를 통해 파일 전파 확인 (연결 + 할당 보장)
    await expect
      .poll(async () => await getNodeFileAssignment(page, dataTableNodeId), {
        message: `DataTable 노드 (${dataTableNodeId})가 파일 ${currentTestFileName}을 수신해야 함`,
        timeout: 10000,
      })
      .toBe(currentTestFileName);

    const metadataAfter = await getWorkflowMetadata(page);
    console.log(
      '📦 Vuex drawflow 데이터 (폴링 후):',
      JSON.stringify(metadataAfter?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    // 백엔드가 성공적으로 응답하는지 확인하기 위해 DataTable API 호출 관찰
    const dataRequestPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/routes/datatable/load_data') &&
        resp.request().method() === 'POST',
      { timeout: 15000 }
    );

    await pageObjects.workflowPage.openNodeModal('DataTable');
    await pageObjects.dataTableModal.verifyModalOpen();

    const dataResponse = await dataRequestPromise;
    const payload = await dataResponse.json();
    console.log('📡 DataTable API 페이로드:', payload);

    if (Object.prototype.hasOwnProperty.call(payload, 'success')) {
      expect(payload.success).toBeTruthy();
    }

    const payloadColumns = Array.isArray(payload.columns) ? payload.columns.length : 0;
    const payloadRows = Array.isArray(payload.rows) ? payload.rows.length : 0;

    expect(payloadColumns).toBeGreaterThan(0);
    expect(payloadRows).toBeGreaterThan(0);

    // 테이블 렌더링 대기
    await pageObjects.dataTableModal.waitForDataLoaded();

    const emptyStateVisible = await pageObjects.dataTableModal.isEmptyStateVisible();
    expect(emptyStateVisible).toBeFalsy();

    await expect(page.locator('.table-layout')).toBeVisible();

    const rowCount = await pageObjects.dataTableModal.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });
});
