// frontend/tests/e2e/workflows/06-result-visualization.spec.js
import { test, expect } from '../fixtures/auth.js';
import { readFile } from 'fs/promises';
import { setupPageObjects } from './support/workflow-setup.js';

/**
 * 테스트 스위트: GRNViz를 사용한 결과 시각화
 *
 * 이 테스트 스위트는 완전한 결과 시각화 워크플로우를 검증합니다:
 * - 준비된 SUCCESS 워크플로우 열기
 * - 모니터링 패널에서 SUCCESS 작업 검증
 * - ResultFiles 모달 확인 (Primary/Intermediate 출력)
 * - 결과 파일 다운로드
 * - 실행 매니페스트 다운로드
 * - 매니페스트 섹션 검증
 * - GRNViz 시각화 실행
 * - Plotly 렌더링 검증
 * - 플롯 이미지 다운로드
 * - 시각화 작업 삭제 및 제거 확인
 *
 * 성공 기준:
 * - SUCCESS 워크플로우가 존재하고 올바르게 로드됨
 * - 작업 모니터링 패널에 SUCCESS 상태 표시
 * - ResultFiles 모달에 Primary 및 Intermediate 출력 표시
 * - 파일 다운로드가 올바르게 작동
 * - 실행 매니페스트에 모든 필수 섹션 포함
 * - GRNViz 시각화가 성공적으로 실행됨
 * - Plotly 차트가 올바르게 렌더링됨
 * - 플롯 이미지 다운로드가 작동
 * - 시각화 작업 삭제가 올바르게 작동
 */
test.describe('GRNViz를 사용한 결과 시각화', () => {
  test.describe.configure({ mode: 'serial' });

  let pageObjects;

  test.beforeEach(async ({ page }) => {
    pageObjects = setupPageObjects(page);
    await pageObjects.projectsPage.goto();
    await pageObjects.projectsPage.verifyPageLoaded();
  });

  /**
   * 테스트: GRNViz 플러그인을 사용하여 TENET 결과 시각화
   *
   * 이 테스트는 완전한 결과 시각화 워크플로우를 검증합니다:
   * - 준비된 SUCCESS 워크플로우 열기
   * - 기존 SUCCESS 작업 검증
   * - 결과 파일 확인 및 다운로드
   * - 실행 매니페스트 다운로드 및 검증
   * - GRNViz 시각화 실행
   * - Plotly 렌더링 검증
   * - 시각화 작업 삭제 및 제거 확인
   */
  test('GRNViz 플러그인을 사용하여 TENET 결과가 시각화되어야 함', async ({ page }) => {
    test.setTimeout(300000);

    await test.step('준비된 SUCCESS 워크플로우 열기', async () => {
      await pageObjects.projectsPage.verifyWorkflowExists('SUCCESS');
      await pageObjects.projectsPage.openWorkflow('SUCCESS');
      await pageObjects.workflowPage.verifyPageLoaded();
      await pageObjects.workflowPage.waitForNodesReady(5, 15000);
    });

    const workflowTitle = await pageObjects.workflowPage.getWorkflowTitle();
    expect(workflowTitle).toContain('SUCCESS');

    await test.step('모니터링 패널에서 기존 SUCCESS 작업 검증', async () => {
      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 60000);
      const entries = await pageObjects.workflowPage.getJobTableEntries();
      const pluginMatcher = 'TENET';
      const typeMatcher = 'Analysis';
      const matchingJobs = entries
        .filter((entry) => entry.name === workflowTitle)
        .filter((entry) => (entry.plugin ?? '').includes(pluginMatcher))
        .filter((entry) => (entry.type ?? '').includes(typeMatcher));

      expect(matchingJobs.length).toBeGreaterThan(0);

      matchingJobs.sort((a, b) => b.startTimestamp - a.startTimestamp);
      const latestMatchingJob = matchingJobs[0];
      expect(latestMatchingJob.status?.toUpperCase?.()).toBe('SUCCESS');

      await page.evaluate(({ job, pluginText, typeText }) => {
        window.__latestSuccessJob = {
          name: job.name,
          plugin: job.plugin,
          type: job.type,
          pluginMatcher: pluginText,
          typeMatcher: typeText,
        };
      }, {
        job: latestMatchingJob,
        pluginText: pluginMatcher,
        typeText: typeMatcher,
      });

      await pageObjects.workflowPage.closeJobTable();
    });

    await test.step('ResultFiles 모달 확인, 다운로드 선택 및 섹션 검증', async () => {
      await pageObjects.workflowPage.openNodeModal('ResultFiles');
      await pageObjects.resultFilesModal.verifyModalOpen();
      await pageObjects.resultFilesModal.waitForPrimarySection(20000);
      await pageObjects.resultFilesModal.waitForIntermediateSection(20000);
      expect(await pageObjects.resultFilesModal.isPrimarySectionVisible()).toBeTruthy();
      expect(await pageObjects.resultFilesModal.isIntermediateSectionVisible()).toBeTruthy();

      const primaryFiles = await pageObjects.resultFilesModal.getPrimaryFileNames();
      const intermediateFiles = await pageObjects.resultFilesModal.getIntermediateFileNames();
      expect(primaryFiles.length + intermediateFiles.length).toBeGreaterThan(1);

      const selectionTargets = primaryFiles.slice(0, 2).map((name) => ({ name, type: 'primary' }));
      if (selectionTargets.length < 2) {
        throw new Error('다운로드할 Primary 파일이 최소 2개 있어야 함');
      }

      console.log('발견된 Primary 파일:', primaryFiles);
      console.log('발견된 Intermediate 파일:', intermediateFiles);
      console.log('선택 대상:', selectionTargets);

      const downloadRequests = [];
      const requestListener = async (request) => {
        if (
          request.url().includes('/routes/workflow/result') &&
          request.method() === 'POST'
        ) {
          try {
            const payload = await request.postDataJSON();
            downloadRequests.push({ url: request.url(), payload });
          } catch (error) {
            console.log('다운로드 요청 페이로드 읽기 실패:', error);
          }
        }
      };
      page.on('request', requestListener);

      const downloads = [];
      for (const target of selectionTargets) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await pageObjects.resultFilesModal.clickPrimaryFileDownloadButton(target.name);
        downloads.push(await downloadPromise);
      }

      const downloadedNames = await Promise.all(
        downloads.map(async (dl) => dl.suggestedFilename())
      );
      const normalizeFilename = (name) => {
        if (!name) return '';
        return name.replace(/ \(\d+\)\./, '.').trim();
      };
      const normalizedDownloadedNames = downloadedNames.map((name) => normalizeFilename(name));
      console.log('다운로드된 파일명:', downloadedNames);
      console.log('정규화된 파일명:', normalizedDownloadedNames);
      console.log('다운로드 요청 페이로드:', downloadRequests);

      for (const target of selectionTargets) {
        expect(
          normalizedDownloadedNames.some((filename) => filename.endsWith(target.name))
        ).toBeTruthy();
      }

      for (const dl of downloads) {
        try {
          const filePath = await dl.path();
          let preview = '<binary>'; // 기본 플레이스홀더
          if (filePath) {
            const content = await readFile(filePath, 'utf-8').catch(() => null);
            if (content !== null) {
              preview = content.substring(0, 200);
            }
          }
          console.log('다운로드된 파일 상세:', {
            suggestedFilename: dl.suggestedFilename(),
            path: await dl.path(),
            preview,
          });
        } catch (error) {
          console.log('다운로드된 파일 검사 실패:', error);
        }
      }

      page.off('request', requestListener);

      await Promise.all(downloads.map((dl) => dl.delete().catch(() => {})));
    });

    await test.step('실행 매니페스트 다운로드 및 섹션 검증', async () => {
      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 60000);

      const latestJobContext = await page.evaluate(() => window.__latestSuccessJob || null);
      if (!latestJobContext) {
        throw new Error('매니페스트 다운로드를 위한 최신 성공 작업 컨텍스트를 찾을 수 없음');
      }

      const manifestDownloadPromise = page.waitForEvent('download');
      await pageObjects.workflowPage.openJobContextMenuForTitle(latestJobContext.name, {
        pluginSubstring: latestJobContext.pluginMatcher,
        typeSubstring: latestJobContext.typeMatcher,
      });
      await pageObjects.workflowPage.selectJobContextOption('Download manifest');

      const manifestDownload = await manifestDownloadPromise;
      const manifestPath = await manifestDownload.path();
      const manifestContent = await readFile(manifestPath, 'utf-8');
      const manifestJson = JSON.parse(manifestContent);

      expect(manifestJson).toHaveProperty('manifest_info');
      expect(manifestJson).toHaveProperty('task_metadata');
      expect(manifestJson).toHaveProperty('plugin_metadata');
      expect(manifestJson).toHaveProperty('workflow_metadata');
      expect(manifestJson).toHaveProperty('execution_files');

      await manifestDownload.delete().catch(() => {});
      await pageObjects.workflowPage.closeJobTable();
    });

    await test.step('GRNViz 시각화 실행 및 Plotly 렌더링 검증', async () => {
      await pageObjects.workflowPage.openNodeModal('Visualization');

      if (!(await pageObjects.visualizationModal.isConfigurationMode())) {
        await pageObjects.visualizationModal.waitForPluginSelection();
        await pageObjects.visualizationModal.selectPluginByName('GRNViz');
        await expect(pageObjects.visualizationModal.visualizationItems.first()).toBeVisible();

        let visualizationName = 'Bar plot';
        const barPlotCount = await pageObjects.visualizationModal.visualizationItems
          .filter({ hasText: 'Bar plot' })
          .count();

        if (barPlotCount === 0) {
          const firstVisualizationText = (await pageObjects.visualizationModal.visualizationItems
            .first()
            .textContent())?.trim();

          if (!firstVisualizationText) {
            throw new Error('GRNViz 플러그인에 사용 가능한 시각화 스크립트가 없음');
          }

          visualizationName = firstVisualizationText;
        }

        await pageObjects.visualizationModal.selectVisualizationByName(visualizationName);
        await pageObjects.visualizationModal.proceedToConfiguration();
      }

      expect(await pageObjects.visualizationModal.getSelectedPluginLabel()).toContain('GRNViz');
      const selectedVisualizationLabel = await pageObjects.visualizationModal.getSelectedVisualizationLabel();
      expect(selectedVisualizationLabel.length).toBeGreaterThan(0);

      const inputParameters = await pageObjects.visualizationModal.getInputFileParameterNames();
      for (const parameterName of inputParameters) {
        const normalizedName = parameterName.trim().toLowerCase();

        if (normalizedName === 'input') {
          await pageObjects.visualizationModal.selectInputFileOption(parameterName, 'FdrOutdegree.txt');
          await expect
            .poll(async () => await pageObjects.visualizationModal.getSelectedInputFile(parameterName))
            .toBe('FdrOutdegree.txt');
        } else if (normalizedName.includes('expression')) {
          await pageObjects.visualizationModal.selectInputFileOption(parameterName, 'expression.csv');
          await expect
            .poll(async () => await pageObjects.visualizationModal.getSelectedInputFile(parameterName))
            .toBe('expression.csv');
        } else if (normalizedName.includes('trajectory')) {
          await pageObjects.visualizationModal.selectInputFileOption(parameterName, 'trajectory.txt');
          await expect
            .poll(async () => await pageObjects.visualizationModal.getSelectedInputFile(parameterName))
            .toBe('trajectory.txt');
        } else {
          await expect
            .poll(async () => (await pageObjects.visualizationModal.getAvailableOptionsForParameter(parameterName)).length > 0, {
              message: `파라미터 ${parameterName}의 옵션 로딩 대기`,
            })
            .toBeTruthy();

          const options = await pageObjects.visualizationModal.getAvailableOptionsForParameter(parameterName);
          const firstNonEmpty = options.find((opt) => opt.trim() !== '' && opt.trim() !== 'Select File');
          if (!firstNonEmpty) {
            throw new Error(`파라미터 ${parameterName}에 대해 선택 가능한 옵션이 없음`);
          }
          await pageObjects.visualizationModal.selectInputFileOption(parameterName, firstNonEmpty.trim());
          await expect
            .poll(async () => await pageObjects.visualizationModal.getSelectedInputFile(parameterName))
            .toBe(firstNonEmpty.trim());
        }
      }

      expect(await pageObjects.visualizationModal.isApplyButtonEnabled()).toBeTruthy();

      const runResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/routes/workflow/visualization') &&
          resp.request().method() === 'POST',
        { timeout: 60000 }
      );

      const resultResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/routes/workflow/visualization/result') &&
          resp.request().method() === 'POST',
        { timeout: 60000 }
      );

      await pageObjects.visualizationModal.clickExecuteVisualization();

      const runResponse = await runResponsePromise;
      const runPayload = await runResponse.json().catch(() => ({}));
      if (Object.prototype.hasOwnProperty.call(runPayload, 'success')) {
        expect(runPayload.success).toBeTruthy();
      }

      const resultResponse = await resultResponsePromise;
      const resultPayload = await resultResponse.json().catch(() => ({}));
      if (Object.prototype.hasOwnProperty.call(resultPayload, 'success')) {
        expect(resultPayload.success).toBeTruthy();
      }
      if (Array.isArray(resultPayload.data)) {
        expect(resultPayload.data.length).toBeGreaterThan(0);
      }

      await pageObjects.visualizationModal.waitForPlotly();
      if ((await pageObjects.visualizationModal.getApplyButtonText()).includes('Show Visualization')) {
        await pageObjects.visualizationModal.clickShowVisualization();
        await pageObjects.visualizationModal.waitForPlotly();
      }
      expect(await pageObjects.visualizationModal.isPlotlyVisible()).toBeTruthy();

      const plotDownload = await pageObjects.visualizationModal.downloadPlotImage();
      const plotFilename = plotDownload.suggestedFilename();
      expect(plotFilename).toMatch(/\.png$/i);
      await plotDownload.delete().catch(() => {});
    });

    await test.step('시각화 작업 삭제 및 제거 확인', async () => {
      // 모달이 닫히고 UI가 안정화될 때까지 대기
      await page.waitForTimeout(1000);

      await pageObjects.workflowPage.openJobTable();
      await pageObjects.workflowPage.waitForJobRows(1, 60000);

      // 이 워크플로우의 Visualization 작업 찾기 (name === workflowTitle)
      const entries = await pageObjects.workflowPage.getJobTableEntries();
      const visualizationJobs = entries
        .filter((entry) => entry.name === workflowTitle)
        .filter((entry) => entry.type === 'Visualization');

      // Visualization 작업이 없으면 삭제 단계 건너뛰기
      if (visualizationJobs.length === 0) {
        console.log(`⚠️ "${workflowTitle}"에 대한 Visualization 작업을 찾을 수 없어 삭제 단계 건너뜀`);
        await pageObjects.workflowPage.closeJobTable();
        return;
      }

      const initialVisualizationCount = visualizationJobs.length;
      console.log(`"${workflowTitle}"의 초기 Visualization 작업 수: ${initialVisualizationCount}`);

      // startTimestamp 기준으로 정렬하여 가장 최근 작업 선택
      visualizationJobs.sort((a, b) => b.startTimestamp - a.startTimestamp);
      const latestVisualizationJob = visualizationJobs[0];

      console.log('삭제할 Visualization 작업:', latestVisualizationJob);

      // 작업이 SUCCESS 또는 FAILURE 상태인지 확인 (둘 다 삭제 가능)
      const jobStatus = latestVisualizationJob.status?.toUpperCase();
      expect(['SUCCESS', 'FAILURE'].includes(jobStatus)).toBeTruthy();
      console.log(`✅ Visualization 작업이 ${jobStatus} 상태임을 확인, 삭제 진행`);

      // Analysis 작업을 대상으로 하지 않도록 type 필터를 사용하여 Visualization 작업 삭제
      await pageObjects.workflowPage.openJobContextMenuForTitle(workflowTitle, {
        typeSubstring: 'Visualization',
      });
      await pageObjects.workflowPage.selectJobContextOption('Delete');
      await pageObjects.workflowPage.waitForMessage('Delete task successfully!', 15000);
      await pageObjects.workflowPage.closeMessage().catch(() => {});

      // 삭제 후 DOM 안정화 대기
      await page.waitForTimeout(1000);

      // 이 워크플로우의 Visualization 작업 수가 1 감소했는지 확인 (name === workflowTitle)
      await pageObjects.workflowPage.openJobTable();
      const entriesAfterDelete = await pageObjects.workflowPage.getJobTableEntries();
      const remainingVisualizationJobs = entriesAfterDelete
        .filter((entry) => entry.name === workflowTitle)
        .filter((entry) => entry.type === 'Visualization');

      console.log(`"${workflowTitle}"의 남은 Visualization 작업 수: ${remainingVisualizationJobs.length}`);
      expect(remainingVisualizationJobs.length).toBe(initialVisualizationCount - 1);

      await pageObjects.workflowPage.closeJobTable();
    });
  });
});
