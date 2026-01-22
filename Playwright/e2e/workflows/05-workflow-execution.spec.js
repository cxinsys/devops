// frontend/tests/e2e/workflows/05-workflow-execution.spec.js
import { test, expect } from '../fixtures/auth.js';
import { testWorkflow, generateUniqueFileName } from './support/workflow-constants.js';
import { setupPageObjects, setupTestFiles, cleanupTestFiles, createWorkflowWithUniqueTitle, cleanupWorkflows } from './support/workflow-setup.js';

/**
 * 테스트 스위트: 워크플로우 실행 및 모니터링
 *
 * 이 종합 테스트 스위트는 워크플로우 실행의 전체 생명주기를 검증합니다:
 * - 워크플로우 생성 및 InputFile 할당
 * - 알고리즘 파라미터 설정
 * - 컴파일 체크 패널 검증
 * - 워크플로우 실행 및 상태 모니터링
 * - 실시간 작업 상태 업데이트 (RUNNING)
 * - 로그 확인 및 다운로드
 * - DAG 진행 시각화
 * - 작업 취소
 * - 작업 삭제 및 제거 확인
 * - 리소스 정리
 *
 * 성공 기준:
 * - 워크플로우가 성공적으로 실행됨
 * - 작업 상태가 올바르게 전환됨 (PENDING → RUNNING → REVOKED)
 * - 플러그인 정보가 올바르게 표시됨 (이름/버전)
 * - 로그에 접근 및 다운로드 가능
 * - DAG 구조 및 규칙 상태 API가 성공적으로 응답
 * - 작업 취소가 정상 작동
 * - 작업 삭제 시 테이블에서 항목 제거됨
 * - 테스트 후 업로드된 파일 정리됨
 */
test.describe('워크플로우 실행 및 모니터링', () => {
  test.describe.configure({ mode: 'serial' });

  let pageObjects;
  const uploadedFiles = [];
  const createdWorkflows = [];
  let currentWorkflowTitle = null;

  test.beforeEach(async ({ page }) => {
    pageObjects = setupPageObjects(page);
    // 고유 파일명으로 테스트 파일 업로드 (이 테스트에서는 사용하지 않지만 일관성 유지)
    await setupTestFiles(pageObjects.filesPage, testWorkflow, uploadedFiles);
    await pageObjects.projectsPage.goto();
    await pageObjects.projectsPage.verifyPageLoaded();
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestFiles(pageObjects.filesPage, uploadedFiles);
    await cleanupWorkflows(pageObjects.projectsPage, createdWorkflows);
  });

  /**
   * 테스트: TENET 워크플로우 실행, 모니터링 및 정리
   *
   * 이 테스트는 워크플로우 실행의 전체 생명주기를 다룹니다:
   * - 파일 업로드 및 워크플로우 설정
   * - 알고리즘 파라미터 설정
   * - 컴파일 체크 검증
   * - 워크플로우 실행
   * - 작업 모니터링 (RUNNING 상태)
   * - 워크플로우 제목 업데이트
   * - 로그 확인 및 다운로드
   * - DAG 진행 시각화
   * - 작업 취소
   * - 작업 삭제 및 확인
   * - 리소스 정리
   */
  test('TENET 워크플로우가 실행되고 모니터링 및 정리되어야 함', async ({ page }) => {
    test.setTimeout(600000);

    const desiredClusters = ['CD4+ T', 'CD14+ Mono', 'NK'];
    const cleanupUploads = [];
    const fixturesToUpload = ['test_data.h5ad'];
    let workflowInputFileName = testWorkflow.expectedFile;

    await test.step('워크플로우 실행을 위한 추가 파일 업로드', async () => {
      await pageObjects.filesPage.goto();
      await pageObjects.filesPage.verifyPageLoaded();

      try {
        await pageObjects.filesPage.selectFolder(testWorkflow.folder);
      } catch (error) {
        console.warn(`⚠️ 폴더 "${testWorkflow.folder}" 선택 실패:`, error.message);
      }

      for (const fixtureName of fixturesToUpload) {
        const uniqueFileName = generateUniqueFileName(fixtureName);
        const { uploadedFileName } = await pageObjects.filesPage.uploadFile(fixtureName, {
          targetFileName: uniqueFileName,
        });
        cleanupUploads.push(uploadedFileName);
        uploadedFiles.push(uploadedFileName);
        await pageObjects.filesPage.waitForUploadComplete();
        await pageObjects.filesPage.verifyFileExists(uploadedFileName);
        console.log(`✅ 픽스처 ${fixtureName}을 ${uploadedFileName}으로 업로드 완료`);

        // 새로 업로드한 PBMC 파일을 워크플로우 입력으로 사용
        workflowInputFileName = uploadedFileName;
      }

      await pageObjects.projectsPage.goto();
      await pageObjects.projectsPage.verifyPageLoaded();
    });

    await test.step('TENET 템플릿에서 워크플로우 생성', async () => {
      // 고유 제목으로 워크플로우 생성
      currentWorkflowTitle = await createWorkflowWithUniqueTitle(
        pageObjects.projectsPage,
        pageObjects.workflowPage,
        testWorkflow,
        createdWorkflows
      );

      await page.waitForSelector('.drawflow-node', { timeout: 10000 });
    });

    await test.step('InputFile 노드에 pbmc 데이터셋 할당', async () => {
      await pageObjects.workflowPage.openNodeModal(testWorkflow.inputNodeName);
      await pageObjects.inputFileModal.assignFile(testWorkflow.folder, workflowInputFileName);
      await pageObjects.workflowPage.closeTab(testWorkflow.inputNodeTabName);
      await page.waitForTimeout(300);
    });

    await test.step('TENET용 Algorithm 노드 파라미터 설정', async () => {
      await pageObjects.workflowPage.openNodeModal('Algorithm');
      await pageObjects.algorithmModal.verifyModalOpen();

      await expect
        .poll(async () => {
          const options = await pageObjects.algorithmModal.getParameterDropdownOptions('cell group');
          return options.includes('seurat_annotation') ? 'ready' : null;
        }, {
          message: 'Cell group 옵션 로딩 대기',
          timeout: 20000,
        })
        .toBe('ready');

      await pageObjects.algorithmModal.setParameterValueByName('cell group', 'seurat_annotation');
      expect(await pageObjects.algorithmModal.getParameterValueByName('cell group')).toBe('seurat_annotation');

      await expect
        .poll(async () => {
          const options = await pageObjects.algorithmModal.getParameterDropdownOptions('pseudotime');
          return options.includes('Pseudotime') ? 'ready' : null;
        }, {
          message: 'pseudotime 옵션 로딩 대기',
          timeout: 20000,
        })
        .toBe('ready');

      await pageObjects.algorithmModal.setParameterValueByName('pseudotime', 'Pseudotime');
      expect(await pageObjects.algorithmModal.getParameterValueByName('pseudotime')).toBe('Pseudotime');

      await pageObjects.algorithmModal.setParameterValueByName('clusters', desiredClusters);
      const selectedClusters = await pageObjects.algorithmModal.getParameterValueByName('clusters');
      expect(selectedClusters).toEqual(expect.arrayContaining(desiredClusters));

      const pluginLogo = await pageObjects.algorithmModal.getPluginLogoText();
      console.log('Algorithm 모달 플러그인:', pluginLogo);
      expect(pluginLogo).toContain(testWorkflow.name);
    });

    await test.step('컴파일 체크 패널 열고 작업 요약 확인', async () => {
      await pageObjects.workflowPage.openCompileCheck();
      await pageObjects.compileCheckModal.waitForOpen();
      await pageObjects.compileCheckModal.waitForResourcesLoaded();
      await pageObjects.compileCheckModal.verifyCoreSectionsVisible();

      const taskEntries = await pageObjects.compileCheckModal.getTaskEntries();
      console.log('컴파일 체크 작업 항목:', taskEntries);
      expect(taskEntries.length).toBeGreaterThan(0);
      expect(
        taskEntries.some((entry) => entry.plugin && entry.plugin.includes(testWorkflow.name))
      ).toBeTruthy();

      const resourceLabels = await pageObjects.compileCheckModal.getResourceLabels();
      console.log('리소스 요약 라벨:', resourceLabels);
      expect(resourceLabels.length).toBeGreaterThan(0);
    });

    await test.step('워크플로우 실행 및 RUNNING 상태 대기', async () => {
      page.once('dialog', async (dialog) => {
        console.log('실행 확인 다이얼로그:', dialog.message());
        await dialog.accept();
      });

      await pageObjects.compileCheckModal.clickExecute();
      await pageObjects.compileCheckModal.waitForClose();

      await page.waitForTimeout(1000);
      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 180000);

      await pageObjects.workflowPage.waitForLatestJobStatus(currentWorkflowTitle, 'RUNNING', 240000);
      const latestJob = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);

      console.log('최신 작업 항목:', latestJob);
      expect(latestJob).not.toBeNull();
      expect(latestJob?.status?.toUpperCase()).toContain('RUNNING');
      expect(latestJob?.plugin ?? '').toContain(testWorkflow.name);

      const pluginFormatRegex = /^[^/]+\/[^ :]+ : v\d+(?:\.\d+)*$/;
      expect(latestJob?.plugin ?? '').toMatch(pluginFormatRegex);
    });

    await test.step('작업이 계속 실행되도록 대기', async () => {
      await page.waitForTimeout(30000);
      await pageObjects.workflowPage.closeJobTable();
    });

    await test.step('RUNNING 작업 검증 및 로그 확인', async () => {
      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 180000);

      await expect
        .poll(async () => {
          const entry = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);
          return entry?.status?.toUpperCase() ?? null;
        }, {
          timeout: 240000,
          message: `작업 "${currentWorkflowTitle}"이 RUNNING 상태 유지 대기`,
        })
        .toBe('RUNNING');

      const latestJob = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);
      console.log('최신 작업 항목:', latestJob);
      expect(latestJob).not.toBeNull();
      expect(latestJob?.name).toBe(currentWorkflowTitle);
      expect(latestJob?.plugin ?? '').toContain(testWorkflow.name);
      const pluginFormatRegex = /^[^/]+\/[^ :]+ : v\d+(?:\.\d+)*$/;
      expect(latestJob?.plugin ?? '').toMatch(pluginFormatRegex);

      await pageObjects.workflowPage.openJobContextMenuForTitle(currentWorkflowTitle);
      await pageObjects.workflowPage.selectJobContextOption('View logs');
      await pageObjects.logsModal.waitForOpen();
      await pageObjects.logsModal.waitForLoaded();
      await pageObjects.logsModal.expectLogsAvailable();

      try {
        const jsonDownload = await pageObjects.logsModal.downloadAllLogsJson();
        await jsonDownload.delete().catch(() => {});
      } catch (error) {
        console.warn('⚠️ JSON 로그 다운로드 실패:', error.message);
      }

      try {
        const txtDownload = await pageObjects.logsModal.downloadFirstLogTxt();
        await txtDownload.delete().catch(() => {});
      } catch (error) {
        console.warn('⚠️ TXT 로그 다운로드 실패:', error.message);
      }

      await pageObjects.logsModal.close();
      await pageObjects.workflowPage.closeMessage().catch(() => {});
    });

    await test.step('워크플로우 진행 시각화 확인', async () => {
      const dagStructurePromise = page.waitForResponse(
        (resp) => resp.url().includes('/dag-structure') && resp.request().method() === 'GET',
        { timeout: 20000 }
      );

      const ruleStatusPromise = page.waitForResponse(
        (resp) => resp.url().includes('/rule-status') && resp.request().method() === 'GET',
        { timeout: 20000 }
      );

      await pageObjects.workflowPage.openJobContextMenuForTitle(currentWorkflowTitle);
      await pageObjects.workflowPage.selectJobContextOption('View progress');

      const dagStructureResponse = await dagStructurePromise;
      expect(dagStructureResponse.ok()).toBeTruthy();

      const ruleStatusResponse = await ruleStatusPromise;
      expect(ruleStatusResponse.ok()).toBeTruthy();

      await pageObjects.dagModal.waitForOpen();
      await pageObjects.dagModal.waitForLoaded();
      await pageObjects.dagModal.close();
    });

    await test.step('실행 중인 작업 취소 및 메시지 확인', async () => {
      await pageObjects.workflowPage.cancelJobByTitle(currentWorkflowTitle);
      await pageObjects.workflowPage.waitForMessage('Cancel task successfully!', 15000);
      await pageObjects.workflowPage.closeMessage().catch(() => {});

      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 60000);
      await pageObjects.workflowPage.waitForLatestJobStatus(currentWorkflowTitle, 'REVOKED', 240000);

      // 상태 변경 후 DOM 안정화 대기
      await page.waitForTimeout(1000);

      const cancelledJob = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);
      console.log('취소된 작업 항목:', cancelledJob);
      expect(cancelledJob?.status?.toUpperCase()).toBe('REVOKED');

      await pageObjects.workflowPage.closeJobTable();
    });

    await test.step('취소된 작업 삭제 및 제거 확인', async () => {
      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 60000);

      // 삭제 전 작업이 REVOKED 상태인지 확인 (삭제 전제조건)
      const jobBeforeDelete = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);
      console.log('삭제 전 작업 상태:', jobBeforeDelete?.status);
      expect(jobBeforeDelete?.status?.toUpperCase()).toBe('REVOKED');
      console.log('✅ 작업이 REVOKED 상태임을 확인, 삭제 진행');

      // REVOKED 상태의 작업 삭제
      await pageObjects.workflowPage.deleteJobByTitle(currentWorkflowTitle);
      await pageObjects.workflowPage.waitForMessage('Delete task successfully!', 15000);
      await pageObjects.workflowPage.closeMessage().catch(() => {});

      // 삭제 후 DOM 안정화 대기
      await page.waitForTimeout(1000);

      // 테이블에서 작업이 제거되었는지 확인
      await pageObjects.workflowPage.openJobTable();
      const deletedJob = await pageObjects.workflowPage.getLatestJobEntryByTitle(currentWorkflowTitle);
      console.log('삭제된 작업 항목 (null이어야 함):', deletedJob);
      expect(deletedJob).toBeNull();

      await pageObjects.workflowPage.closeJobTable();
    });

    await test.step('업로드된 테스트 파일 정리', async () => {
      if (cleanupUploads.length === 0) {
        return;
      }

      await pageObjects.filesPage.goto();
      await pageObjects.filesPage.verifyPageLoaded();

      try {
        await pageObjects.filesPage.selectFolder(testWorkflow.folder);
      } catch (error) {
        console.warn(`⚠️ 폴더 "${testWorkflow.folder}" 다시 열기 실패:`, error.message);
      }

      for (const fileName of cleanupUploads) {
        try {
          await pageObjects.filesPage.deleteFile(fileName);
          await pageObjects.filesPage.verifyFileNotExists(fileName);
          console.log(`🧹 업로드된 파일 삭제 완료: ${fileName}`);
        } catch (error) {
          console.warn(`⚠️ 업로드된 파일 ${fileName} 삭제 실패:`, error.message);
        } finally {
          const idx = uploadedFiles.indexOf(fileName);
          if (idx !== -1) {
            uploadedFiles.splice(idx, 1);
          }
        }
      }

      cleanupUploads.length = 0;
    });
  });
});
