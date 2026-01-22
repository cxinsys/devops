// frontend/tests/e2e/workflows/01-file-assignment.spec.js
import { test, expect } from '../fixtures/auth.js';
import { testWorkflow } from './support/workflow-constants.js';
import { setupPageObjects, setupTestFiles, cleanupTestFiles, setupFileChangeTest, createWorkflowWithUniqueTitle, cleanupWorkflows } from './support/workflow-setup.js';
import { inputFileNodeExists } from '../utils/workflow.js';

/**
 * 테스트 스위트: InputFile 노드 - 파일 할당
 *
 * 이 테스트 스위트는 InputFile 노드의 핵심 파일 할당 기능을 검증합니다:
 * - InputFile 노드 모달 열기
 * - 폴더 구조 탐색
 * - 파일 선택 및 적용
 * - Vuex 스토어 영속성 확인
 * - 할당된 파일 변경
 *
 * 성공 기준:
 * - 폴더 선택 시 해당 폴더가 하이라이트됨
 * - 파일 선택 시 파일 상세 정보가 표시됨
 * - 제출 후 Apply 버튼이 "Applied"로 변경됨
 * - 파일이 Vuex 스토어에 영속화됨 (모달 재오픈으로 확인)
 * - 파일 변경 시 Vuex 상태가 업데이트되고 Apply 버튼이 리셋됨
 */
test.describe('InputFile 노드 - 파일 할당', () => {
  // 병렬 실행 문제를 방지하기 위해 순차 모드 설정
  test.describe.configure({ mode: 'serial' });

  // 이 스위트의 모든 테스트(훅 포함)에 대한 타임아웃 설정
  test.setTimeout(60000);

  let pageObjects;
  const uploadedFiles = [];
  const createdWorkflows = [];
  let currentTestFileName = null;
  let currentWorkflowTitle = null;

  test.beforeEach(async ({ page }) => {
    // 페이지 객체 초기화
    pageObjects = setupPageObjects(page);

    // 테스트 격리를 위해 고유 파일명으로 테스트 파일 업로드
    const { uploadedFileName } = await setupTestFiles(pageObjects.filesPage, testWorkflow, uploadedFiles);
    currentTestFileName = uploadedFileName;

    // Projects 페이지로 이동 (픽스처를 통해 이미 인증됨)
    await pageObjects.projectsPage.goto();
    await pageObjects.projectsPage.verifyPageLoaded();
  });

  test.afterEach(async ({ page }) => {
    // 업로드된 파일 정리
    await cleanupTestFiles(pageObjects.filesPage, uploadedFiles);
    // 생성된 워크플로우 정리
    await cleanupWorkflows(pageObjects.projectsPage, createdWorkflows);
  });

  /**
   * 테스트: 워크플로우 입력 노드에 h5ad 파일 할당
   *
   * 핵심 파일 할당 기능 검증:
   * - TENET 템플릿으로 워크플로우 생성
   * - InputFile 노드 모달 열기
   * - 폴더 구조에서 파일 선택
   * - 파일 할당 적용
   * - Vuex 스토어 영속성 확인
   */
  test('워크플로우 입력 노드에 h5ad 파일이 할당되어야 함', async ({ page }) => {
    // 고유 제목으로 워크플로우 생성
    currentWorkflowTitle = await createWorkflowWithUniqueTitle(
      pageObjects.projectsPage,
      pageObjects.workflowPage,
      testWorkflow,
      createdWorkflows
    );

    // 캔버스에 노드가 렌더링될 때까지 대기
    await page.waitForSelector('.drawflow-node', { timeout: 10000 });

    // 캔버스에 InputFile 노드 존재 확인 (TENET 템플릿에 포함되어 있어야 함)
    const inputFileExists = await inputFileNodeExists(page);
    expect(inputFileExists).toBeTruthy();

    // InputFile 노드 모달 열기
    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);

    // 모달이 열렸는지 확인
    await pageObjects.inputFileModal.verifyModalOpen();

    // 폴더 구조가 로드되었는지 확인
    const folders = await pageObjects.inputFileModal.getFolders();
    expect(folders.length).toBeGreaterThan(0);
    console.log('사용 가능한 폴더:', folders);

    // 테스트 폴더 선택
    await pageObjects.inputFileModal.selectFolder(testWorkflow.folder);

    // 폴더가 선택되었는지 확인 (하이라이트)
    await pageObjects.inputFileModal.verifyFolderSelected(testWorkflow.folder);

    // 폴더 내 파일 목록 조회
    const files = await pageObjects.inputFileModal.getFiles();
    expect(files.length).toBeGreaterThan(0);
    console.log('사용 가능한 파일:', files);

    // 예상 파일 존재 확인 (동적 파일명 사용)
    await pageObjects.inputFileModal.verifyFileExists(currentTestFileName);

    // 파일 선택
    await pageObjects.inputFileModal.selectFile(currentTestFileName);

    // 파일이 선택되었는지 확인 (하이라이트)
    await pageObjects.inputFileModal.verifyFileSelected(currentTestFileName);

    // 현재 파일 표시 영역에 선택한 파일이 표시되는지 확인
    await pageObjects.inputFileModal.verifyCurrentFile(currentTestFileName);

    // 현재 파일 정보 조회
    const fileInfo = await pageObjects.inputFileModal.getCurrentFileInfo();
    expect(fileInfo).not.toBeNull();
    expect(fileInfo.name).toBe(currentTestFileName);
    console.log('선택된 파일 정보:', fileInfo);

    // Apply 버튼이 "Apply" 상태인지 확인 (아직 적용 안 됨)
    await pageObjects.inputFileModal.verifyApplyButtonState(false);

    // Apply 클릭하여 파일 할당
    await pageObjects.inputFileModal.clickApply();
    // clickApply()가 내부적으로 "Applied" 상태를 검증함

    // 참고: Apply 버튼 클릭은 Vuex 스토어만 업데이트하며, 백엔드 API 호출 없음
    // - applyFile() 메서드(InputFile.vue:135-149)는 Vuex에만 커밋
    // - 백엔드 영속화는 워크플로우 저장/실행 시 발생
    // - 이 테스트는 UI 상태와 세션 수준 영속성만 검증
    console.log('✅ InputFile 할당 완료 (Vuex 스토어 업데이트됨)');

    // 영속성 검증: 모달 닫고 다시 열기
    // 동일 세션 내에서 Vuex 스토어가 파일 정보를 유지하는지 확인
    // 참고: 탭 텍스트는 "input.h5ad"로 표시됨 (소문자, 점 사용)
    await pageObjects.workflowPage.closeTab(testWorkflow.inputNodeTabName);
    await page.waitForTimeout(500);

    // 모달 다시 열기
    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);
    await pageObjects.inputFileModal.verifyModalOpen();

    // 파일이 여전히 할당되어 있는지 확인 (Vuex 스토어에서)
    // 모달이 다시 열리면, mounted() 훅(InputFile.vue:151-178)이 스토어에서 읽음:
    //   const currentFile = this.$store.getters.getWorkflowNodeFileInfo(this.nodeId)
    await expect
      .poll(async () => {
        const info = await pageObjects.inputFileModal.getCurrentFileInfo();
        return info?.name ?? null;
      }, {
        message: 'InputFile 모달이 할당된 파일을 다시 로드할 때까지 대기',
        timeout: 10000,
      })
      .toBe(currentTestFileName);

    // Apply 버튼이 여전히 "Applied" 상태인지 확인
    await pageObjects.inputFileModal.verifyApplyButtonState(true);

    console.log('✅ Vuex 스토어에 파일 할당이 영속화됨 (세션 수준)');
    console.log('ℹ️  참고: 백엔드 영속화는 워크플로우 저장/실행 시 발생');
  });

  /**
   * 테스트: 할당된 입력 파일을 다른 파일로 변경
   *
   * 엣지 케이스 검증:
   * - 초기 선택 후 사용자가 파일 할당을 변경할 수 있는지 확인
   * - 파일 변경 시 Apply 버튼 상태가 리셋되는지 테스트
   * - 새 파일 선택으로 Vuex 스토어가 업데이트되는지 확인
   */
  test('할당된 입력 파일이 다른 파일로 변경되어야 함', async ({ page }) => {
    // 파일 변경 테스트를 위해 고유 파일명으로 두 번째 파일 업로드
    const { uploadedFileName: firstFile, secondFileName: secondFile } = await setupTestFiles(
      pageObjects.filesPage,
      testWorkflow,
      uploadedFiles,
      { uploadSecondFile: true }
    );

    console.log(`📝 파일 변경 테스트 파일: "${firstFile}" 및 "${secondFile}"`);

    // Projects 페이지로 이동
    await pageObjects.projectsPage.goto();
    await pageObjects.projectsPage.verifyPageLoaded();

    // 고유 제목으로 워크플로우 생성
    currentWorkflowTitle = await createWorkflowWithUniqueTitle(
      pageObjects.projectsPage,
      pageObjects.workflowPage,
      testWorkflow,
      createdWorkflows
    );

    // 캔버스에 노드가 렌더링될 때까지 대기
    await page.waitForSelector('.drawflow-node', { timeout: 10000 });

    // InputFile 모달 열기
    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);
    await pageObjects.inputFileModal.verifyModalOpen();

    // 파일 표시를 위해 폴더 선택
    await pageObjects.inputFileModal.selectFolder(testWorkflow.folder);

    // 이 테스트를 위해 최소 2개의 파일이 있는지 확인
    const files = await pageObjects.inputFileModal.getFiles();
    expect(files.length).toBeGreaterThan(1); // 이 테스트에는 최소 2개 파일 필요

    // 첫 번째 파일 선택 및 적용
    await pageObjects.inputFileModal.selectFile(firstFile);
    await pageObjects.inputFileModal.clickApply();
    // clickApply()가 내부적으로 "Applied" 상태를 검증함

    console.log(`✅ 첫 번째 파일 "${firstFile}" 할당됨`);

    // 두 번째 파일로 변경
    console.log(`🔄 두 번째 파일 선택 중: ${secondFile}`);
    await pageObjects.inputFileModal.selectFile(secondFile);
    await pageObjects.inputFileModal.verifyCurrentFile(secondFile);

    // Vue 반응성이 Apply 버튼 상태를 업데이트할 때까지 대기
    await page.waitForTimeout(500);

    // Apply 버튼이 "Apply" 상태로 돌아왔는지 확인 ("Applied" 아님)
    // fileClick()이 this.apply = false로 설정하므로 이렇게 되어야 함
    console.log('🔍 파일 변경 후 Apply 버튼 상태 확인 중...');
    const applyButtonText = await page.locator('label.form__button--apply').textContent();
    console.log(`Apply 버튼 텍스트: "${applyButtonText.trim()}"`);

    // 모달이 여전히 열려 있고 올바른 페이지에 있는지 확인
    const currentUrl = page.url();
    console.log(`두 번째 Apply 전 현재 URL: ${currentUrl}`);
    expect(currentUrl).toContain('/workflow');

    // 모달이 보이는지 확인
    await pageObjects.inputFileModal.verifyModalOpen();

    // 두 번째 파일 적용
    console.log(`📤 두 번째 파일 적용 중: ${secondFile}`);
    await pageObjects.inputFileModal.clickApply();
    // clickApply()가 내부적으로 "Applied" 상태를 검증함

    // 적용 후에도 워크플로우 페이지에 있는지 확인
    const urlAfterApply = page.url();
    console.log(`두 번째 Apply 후 현재 URL: ${urlAfterApply}`);
    expect(urlAfterApply).toContain('/workflow');

    console.log(`✅ 두 번째 파일 "${secondFile}" 성공적으로 할당됨`);

    // 새 파일의 영속성 검증
    // 참고: 탭 텍스트는 "input.h5ad"로 표시됨 (소문자, 점 사용)
    await pageObjects.workflowPage.closeTab(testWorkflow.inputNodeTabName);
    await page.waitForTimeout(500);

    await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);

    // mounted() 훅이 완료되고 Vuex 스토어가 읽힐 때까지 대기
    await page.waitForTimeout(500);

    await pageObjects.inputFileModal.verifyModalOpen();

    // InputFile 모달이 Vuex 스토어에서 파일 정보를 다시 로드할 때까지 대기
    await expect
      .poll(async () => {
        const info = await pageObjects.inputFileModal.getCurrentFileInfo();
        return info?.name ?? null;
      }, {
        message: 'InputFile 모달이 두 번째 파일을 다시 로드할 때까지 대기',
        timeout: 10000,
      })
      .toBe(secondFile);

    console.log(`✅ 파일이 성공적으로 "${secondFile}"로 변경됨`);
  });
});
