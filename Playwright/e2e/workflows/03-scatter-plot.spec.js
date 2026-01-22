// frontend/tests/e2e/workflows/03-scatter-plot.spec.js
import { test, expect } from '../fixtures/auth.js';
import { testWorkflow } from './support/workflow-constants.js';
import { setupPageObjects, setupTestFiles, cleanupTestFiles, createWorkflowWithUniqueTitle, cleanupWorkflows } from './support/workflow-setup.js';
import { getNodeFileAssignment, getWorkflowMetadata } from '../utils/workflow.js';

/**
 * 테스트 스위트: ScatterPlot 노드 - UMAP 시각화
 *
 * 이 테스트 스위트는 ScatterPlot 노드 기능을 검증합니다:
 * - InputFile에서 ScatterPlot으로의 파일 전파
 * - UMAP 데이터로 Plotly 렌더링
 * - 대화형 드롭다운 컨트롤 (X축, Y축, 그룹)
 * - 파라미터 변경 시 플롯 재렌더링
 *
 * 성공 기준:
 * - 파일 할당이 ScatterPlot 노드로 전파됨
 * - API 호출이 성공하고 데이터 반환
 * - 빈 상태 없이 Plotly 차트 렌더링
 * - 트레이스 수가 0보다 큼
 * - 드롭다운 변경이 재렌더링을 트리거함
 */
test.describe('ScatterPlot 노드 - UMAP 시각화', () => {
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
   * 테스트: ScatterPlot 노드에 UMAP 산점도가 렌더링되어야 함
   *
   * ScatterPlot 기능 검증:
   * - InputFile 노드에 파일 할당
   * - 연결을 통해 ScatterPlot으로 파일 전파
   * - UMAP 데이터 로딩을 위한 API 호출
   * - Plotly 차트 렌더링
   * - 대화형 드롭다운 컨트롤
   */
  test('ScatterPlot 노드에 UMAP 산점도가 렌더링되어야 함', async ({ page }) => {
    test.setTimeout(60000);

    // 고유 제목으로 워크플로우 생성
    currentWorkflowTitle = await createWorkflowWithUniqueTitle(
      pageObjects.projectsPage,
      pageObjects.workflowPage,
      testWorkflow,
      createdWorkflows
    );

    await page.waitForSelector('.drawflow-node', { timeout: 10000 });

    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);
    await pageObjects.inputFileModal.assignFile(testWorkflow.folder, currentTestFileName);

    await pageObjects.workflowPage.closeTab(testWorkflow.inputNodeTabName);
    await page.waitForTimeout(300);

    const scatterLocator = await pageObjects.workflowPage.findNodeByType('ScatterPlot');
    const scatterNodeIdAttr = await scatterLocator.getAttribute('id');
    const scatterNodeId = scatterNodeIdAttr?.replace('node-', '') ?? '9';

    const scatterMetadataBefore = await getWorkflowMetadata(page);
    console.log(
      '📦 ScatterPlot 폴링 전 Vuex drawflow 데이터:',
      JSON.stringify(scatterMetadataBefore?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    await expect
      .poll(async () => {
        const assignment = await getNodeFileAssignment(page, scatterNodeId);
        if (!assignment) return null;
        if (typeof assignment === 'string') return assignment;
        if (Array.isArray(assignment)) {
          return assignment.find((item) => item === currentTestFileName) ?? null;
        }
        if (typeof assignment === 'object') {
          const values = Object.values(assignment);
          return values.find((item) => item === currentTestFileName) ?? null;
        }
        return null;
      }, {
        message: `ScatterPlot 노드 (${scatterNodeId})가 파일 ${currentTestFileName}을 수신해야 함`,
        timeout: 10000,
      })
      .toBe(currentTestFileName);

    const scatterMetadataAfter = await getWorkflowMetadata(page);
    console.log(
      '📦 ScatterPlot 폴링 후 Vuex drawflow 데이터:',
      JSON.stringify(scatterMetadataAfter?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    const scatterDataResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/routes/files/data/') &&
        resp.request().method() === 'GET',
      { timeout: 15000 }
    );

    await pageObjects.workflowPage.openNodeModal('ScatterPlot');
    await pageObjects.scatterPlotModal.verifyModalOpen();

    const scatterDataResponse = await scatterDataResponsePromise;
    const scatterPayload = await scatterDataResponse.json();
    console.log('📡 ScatterPlot API 페이로드:', scatterPayload);

    if (Object.prototype.hasOwnProperty.call(scatterPayload, 'success')) {
      expect(scatterPayload.success).toBeTruthy();
    }

    await pageObjects.scatterPlotModal.waitForPlotly();

    const blankStateVisible = await pageObjects.scatterPlotModal.isBlankStateVisible();
    expect(blankStateVisible).toBeFalsy();

    await expect(page.locator('#plotly__scatter')).toBeVisible();

    const traceCount = await pageObjects.scatterPlotModal.getTraceCount();
    expect(traceCount).toBeGreaterThan(0);

    await test.step('ScatterPlot X축 드롭다운 변경', async () => {
      const { previous, next } = await pageObjects.scatterPlotModal.selectDifferentXAxis();
      console.log(`🔁 ScatterPlot X축 변경됨: ${previous} → ${next}`);
      expect(next).not.toBe(previous);
      await pageObjects.scatterPlotModal.waitForPlotly();
      const current = await pageObjects.scatterPlotModal.getSelectedXAxisValue();
      expect(current).toBe(next);
    });

    await test.step('ScatterPlot Y축 드롭다운 변경', async () => {
      const { previous, next } = await pageObjects.scatterPlotModal.selectDifferentYAxis();
      console.log(`🔁 ScatterPlot Y축 변경됨: ${previous} → ${next}`);
      expect(next).not.toBe(previous);
      await pageObjects.scatterPlotModal.waitForPlotly();
      const current = await pageObjects.scatterPlotModal.getSelectedYAxisValue();
      expect(current).toBe(next);
    });

    await test.step('ScatterPlot 그룹 드롭다운 변경', async () => {
      const { previous, next } = await pageObjects.scatterPlotModal.selectDifferentGroup();
      console.log(`🔁 ScatterPlot 그룹 변경됨: ${previous} → ${next}`);
      expect(next).not.toBe(previous);
      await pageObjects.scatterPlotModal.waitForPlotly();
      const current = await pageObjects.scatterPlotModal.getSelectedGroupValue();
      expect(current).toBe(next);
      const tracesAfterGroup = await pageObjects.scatterPlotModal.getTraceCount();
      expect(tracesAfterGroup).toBeGreaterThan(0);
    });
  });
});
