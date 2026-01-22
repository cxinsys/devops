// frontend/tests/e2e/workflows/04-algorithm-config.spec.js
import { test, expect } from '../fixtures/auth.js';
import { testWorkflow } from './support/workflow-constants.js';
import { setupPageObjects, setupTestFiles, cleanupTestFiles, createWorkflowWithUniqueTitle, cleanupWorkflows } from './support/workflow-setup.js';
import { getNodeFileAssignment, getWorkflowMetadata } from '../utils/workflow.js';

/**
 * 테스트 스위트: Algorithm 노드 - 파라미터 설정
 *
 * 이 테스트 스위트는 Algorithm 노드의 파라미터 설정 기능을 검증합니다:
 * - InputFile에서 Algorithm 노드로의 파일 전파
 * - 플러그인 로고 및 이름 표시
 * - 입력 파일 드롭다운 검증
 * - 파라미터 타입별(숫자, 문자열, 불리언, 드롭다운) 수정
 * - 파라미터 변경 시 Vuex 스토어 동기화
 *
 * 성공 기준:
 * - 파일 할당이 Algorithm 노드로 전파됨
 * - 플러그인 로고에 올바른 플러그인 이름 표시
 * - 입력 파일 드롭다운에 할당된 파일 표시
 * - 모든 파라미터 타입 수정 가능
 * - 파라미터 변경이 Vuex selectedPluginRules에 반영됨
 */
test.describe('Algorithm 노드 - 파라미터 설정', () => {
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
   * 테스트: TENET 알고리즘 파라미터 설정
   *
   * Algorithm 노드 파라미터 설정 검증:
   * - InputFile 노드에 파일 할당
   * - Algorithm 노드로 파일 전파
   * - 플러그인 로고 검증
   * - 입력 파일 드롭다운 검증
   * - 파라미터 수정 (숫자, 문자열, 불리언, 드롭다운)
   * - Vuex 스토어 업데이트 검증
   */
  test('TENET 알고리즘 파라미터가 설정되어야 함', async ({ page }) => {
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

    const algorithmLocator = await pageObjects.workflowPage.findNodeByType('Algorithm');
    const algorithmNodeIdAttr = await algorithmLocator.getAttribute('id');
    const algorithmNodeId = algorithmNodeIdAttr?.replace('node-', '') ?? '12';

    await expect
      .poll(async () => {
        const assignment = await getNodeFileAssignment(page, algorithmNodeId);
        if (!assignment) return null;

        if (typeof assignment === 'string') {
          return assignment.includes(currentTestFileName) ? assignment : null;
        }

        if (Array.isArray(assignment)) {
          return assignment.find((value) =>
            typeof value === 'string' && value.includes(currentTestFileName)
          ) ?? null;
        }

        if (typeof assignment === 'object') {
          return (
            Object.values(assignment).find(
              (value) => typeof value === 'string' && value.includes(currentTestFileName)
            ) ?? null
          );
        }

        return null;
      }, {
        message: `Algorithm 노드 (${algorithmNodeId})가 파일 ${currentTestFileName}을 수신해야 함`,
        timeout: 10000,
      })
      .not.toBeNull();

    await pageObjects.workflowPage.openNodeModal('Algorithm');
    await pageObjects.algorithmModal.verifyModalOpen();

    await expect
      .poll(async () => {
        const logoText = await pageObjects.algorithmModal.getPluginLogoText();
        return logoText;
      }, {
        message: `알고리즘 로고에 플러그인 이름 ${testWorkflow.name}이 표시될 때까지 대기`,
        timeout: 15000,
      })
      .toContain(testWorkflow.name);

    const pluginLogoText = await pageObjects.algorithmModal.getPluginLogoText();
    console.log('🔖 알고리즘 로고 텍스트:', pluginLogoText);

    await pageObjects.algorithmModal.verifyFileInDropdown(0, currentTestFileName);
    const selectedInputFile = await pageObjects.algorithmModal.getSelectedInputFile(0);
    expect(selectedInputFile).toContain(currentTestFileName);

    const metadataBefore = await getWorkflowMetadata(page);
    console.log(
      '📦 Algorithm 파라미터 변경 전 Vuex drawflow 데이터:',
      JSON.stringify(metadataBefore?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    const algorithmNodeDataBefore = metadataBefore?.workflowInfo?.drawflow?.Home?.data?.[algorithmNodeId];
    const pluginRulesBefore = algorithmNodeDataBefore?.data?.selectedPluginRules ?? [];
    console.log('🧮 Algorithm selectedPluginRules (변경 전):', JSON.stringify(pluginRulesBefore, null, 2));

    const flattenedParamsBefore = pluginRulesBefore.flatMap((rule) => rule.parameters ?? []);

    // 숫자형 파라미터 검색 및 수정
    const numericParam = flattenedParamsBefore.find((param) =>
      ['int', 'float', 'number'].includes(param?.type)
    );
    let numericParamName = null;
    let numericNewValue = null;
    if (numericParam) {
      numericParamName = numericParam.name;
      const numericInitialValue = Number(numericParam.defaultValue ?? 0);
      numericNewValue = String(numericInitialValue + 1);
      await pageObjects.algorithmModal.setParameterValueByName(numericParamName, numericNewValue);
      const numericUiValue = await pageObjects.algorithmModal.getParameterValueByName(numericParamName);
      expect(numericUiValue).toBe(numericNewValue);
    }

    // 문자열형 파라미터 검색 및 수정 (숫자형이 없을 경우)
    const stringParam = flattenedParamsBefore.find((param) => param?.type === 'string');
    let stringParamName = null;
    let stringNewValue = null;
    if (!numericParam && stringParam) {
      stringParamName = stringParam.name;
      const stringInitialValue = stringParam.defaultValue ?? '';
      stringNewValue = stringInitialValue === '' ? 'test-value' : `${stringInitialValue}-updated`;
      await pageObjects.algorithmModal.setParameterValueByName(stringParamName, stringNewValue);
      const stringUiValue = await pageObjects.algorithmModal.getParameterValueByName(stringParamName);
      expect(stringUiValue).toBe(stringNewValue);
    }

    // 불리언형 파라미터 검색 및 토글
    const booleanParam = flattenedParamsBefore.find((param) => param?.type === 'boolean');
    let booleanParamName = null;
    let booleanNewValue = null;
    if (booleanParam) {
      booleanParamName = booleanParam.name;
      const booleanInitialValue = booleanParam.defaultValue === true || booleanParam.defaultValue === 'true';
      booleanNewValue = !booleanInitialValue;
      await pageObjects.algorithmModal.setParameterValueByName(booleanParamName, booleanNewValue);
      const booleanUiValue = await pageObjects.algorithmModal.getParameterValueByName(booleanParamName);
      expect(booleanUiValue).toBe(booleanNewValue);
    }

    // 드롭다운형 파라미터 검색 및 선택 변경
    const dropdownParam = flattenedParamsBefore.find(
      (param) => param?.type === 'h5adParameter' && param?.name !== 'clusters'
    );
    let dropdownParamName = null;
    let dropdownNewValue = null;
    if (dropdownParam) {
      dropdownParamName = dropdownParam.name;
      const dropdownOptions = await pageObjects.algorithmModal.getParameterDropdownOptions(dropdownParamName);
      console.log(`📝 ${dropdownParamName} 드롭다운 옵션:`, dropdownOptions);
      const preferredOption = dropdownOptions.find((opt) => opt && opt !== dropdownParam.defaultValue) ?? dropdownOptions[0];

      if (preferredOption && preferredOption !== dropdownParam.defaultValue) {
        const { next } = await pageObjects.algorithmModal.selectParameterDropdownOption(
          dropdownParamName,
          preferredOption
        );
        dropdownNewValue = next;
        const dropdownUiValue = await pageObjects.algorithmModal.getParameterValueByName(dropdownParamName);
        expect(dropdownUiValue).toBe(dropdownNewValue);
      }
    }

    // Vue 반응성이 Vuex 스토어를 업데이트할 때까지 대기
    await page.waitForTimeout(500);

    const metadataAfter = await getWorkflowMetadata(page);
    console.log(
      '📦 Algorithm 폴링 후 Vuex drawflow 데이터:',
      JSON.stringify(metadataAfter?.workflowInfo?.drawflow?.Home?.data ?? null, null, 2)
    );

    const algorithmNodeDataAfter = metadataAfter?.workflowInfo?.drawflow?.Home?.data?.[algorithmNodeId];
    const pluginRulesAfter = algorithmNodeDataAfter?.data?.selectedPluginRules ?? [];
    const flattenedParamsAfter = pluginRulesAfter.flatMap((rule) => rule.parameters ?? []);

    // 숫자형 파라미터 변경 검증
    if (numericParamName) {
      const updatedNumericParam = flattenedParamsAfter.find((param) => param?.name === numericParamName);
      expect(updatedNumericParam?.defaultValue).toBe(numericNewValue);
    }

    // 문자열형 파라미터 변경 검증
    if (stringParamName) {
      const updatedStringParam = flattenedParamsAfter.find((param) => param?.name === stringParamName);
      expect(updatedStringParam?.defaultValue).toBe(stringNewValue);
    }

    // 불리언형 파라미터 변경 검증
    if (booleanParamName) {
      const updatedBooleanParam = flattenedParamsAfter.find((param) => param?.name === booleanParamName);
      const booleanAfterValue = updatedBooleanParam?.defaultValue;
      const booleanAfterNormalized = booleanAfterValue === true || booleanAfterValue === 'true';
      expect(booleanAfterNormalized).toBe(booleanNewValue);
    }

    // 드롭다운형 파라미터 변경 검증
    if (dropdownParamName && dropdownNewValue) {
      const updatedDropdownParam = flattenedParamsAfter.find((param) => param?.name === dropdownParamName);
      expect(updatedDropdownParam?.defaultValue).toBe(dropdownNewValue);
    }
  });
});
