// frontend/tests/e2e/authenticated-workflow.spec.js
import { test, expect } from './fixtures/auth.js';
import { DatasetsPage } from './pages/DatasetsPage.js';
import { FilesPage } from './pages/FilesPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import {
  goToDatasets,
  goToFiles,
  goToProjects,
  verifyAuthenticated,
} from './utils/navigation.js';

/**
 * 타임스탬프와 랜덤 접미사를 사용하여 고유한 파일명 생성
 * @param {string} baseFileName - 기본 파일명 (예: "test_data.h5ad")
 * @returns {string} 고유 파일명 (예: "test_data_1730419234567_abc123.h5ad")
 */
function generateUniqueFileName(baseFileName) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const extension = baseFileName.substring(baseFileName.lastIndexOf('.'));
  const baseName = baseFileName.substring(0, baseFileName.lastIndexOf('.'));

  return `${baseName}_${timestamp}_${randomId}${extension}`;
}

/**
 * 파일 페이지에서 모든 테스트 파일 정리
 * @param {import('@playwright/test').Page} page - Playwright 페이지 객체
 */
async function cleanupTestFiles(page) {
  const filesPage = new FilesPage(page);

  try {
    // 파일 페이지로 직접 이동 (어느 페이지에서든 동작)
    await page.goto('/files');
    await page.waitForLoadState('networkidle');

    // 현재 폴더의 모든 파일 조회
    const allFiles = await filesPage.getFileList();
    const testFiles = allFiles.filter((file) => file.name.startsWith('test_'));

    if (testFiles.length > 0) {
      console.log(`🧹 정리: ${testFiles.length}개의 테스트 파일 발견`);

      // 'test_'로 시작하는 모든 파일 삭제
      for (const file of testFiles) {
        try {
          await filesPage.deleteFile(file.name);
          console.log(`  ✓ ${file.name} 삭제 완료`);
        } catch (error) {
          console.warn(`  ⚠ ${file.name} 삭제 실패:`, error.message);
        }
      }

      // 삭제 완료 대기
      await page.waitForLoadState('networkidle');
      console.log(`✅ 정리 완료`);
    }
  } catch (error) {
    console.warn('정리 실패:', error.message);
  }
}

/**
 * 테스트 스위트: 프로젝트 초기화 워크플로우
 *
 * 이 테스트 스위트는 튜토리얼 데이터셋을 사용하여 새 프로젝트를 초기화하고
 * TENET 기반 워크플로우를 생성하는 전체 워크플로우를 검증합니다.
 *
 * 테스트 시나리오:
 * 1. Datasets 페이지에서 튜토리얼 데이터셋(PBMCLight1000.h5ad) 다운로드
 * 2. Files 페이지를 통해 다양한 파일 형식(H5AD, CSV, TXT) 업로드
 * 3. 업로드된 모든 파일이 파일 목록에 표시되는지 확인
 * 4. TENET 템플릿을 사용하여 새 워크플로우 프로젝트 생성
 *
 * 참고: 이 테스트 스위트는 공유 폴더의 파일 충돌을 방지하기 위해 순차적으로 실행됩니다
 */
test.describe.serial('프로젝트 초기화 워크플로우', () => {
  // 정리를 위한 업로드된 파일 추적
  let uploadedFiles = [];

  test.beforeEach(async ({ page }) => {
    // 각 테스트 전에 사용자 인증 확인
    await page.goto('/projects');
    await verifyAuthenticated(page);

    // 업로드된 파일 추적 초기화
    uploadedFiles = [];
  });

  test.afterEach(async ({ page }) => {
    // 정리: 업로드된 모든 테스트 파일 삭제
    if (uploadedFiles.length > 0) {
      const filesPage = new FilesPage(page);

      try {
        // 파일 페이지로 직접 이동 (워크플로우 페이지 포함 어느 페이지에서든 동작)
        await page.goto('/files');
        await page.waitForLoadState('networkidle');

        for (const fileName of uploadedFiles) {
          try {
            await filesPage.deleteFile(fileName);
            console.log(`✓ 테스트 파일 정리 완료: ${fileName}`);
          } catch (error) {
            console.warn(`${fileName} 삭제 실패:`, error.message);
          }
        }
      } catch (error) {
        console.warn('정리 실패:', error.message);
      }
    }
  });

  test('전체 프로젝트 초기화 흐름이 완료되어야 함', async ({ page }) => {
    // ============================================
    // 사전 정리: 이전 테스트 파일 제거
    // ============================================
    await cleanupTestFiles(page);

    // ============================================
    // 단계 1: 튜토리얼 데이터셋 다운로드
    // ============================================
    await test.step('PBMCLight1000 데이터셋 다운로드', async () => {
      const datasetsPage = new DatasetsPage(page);

      // Datasets 페이지로 이동
      await goToDatasets(page);
      await datasetsPage.verifyPageLoaded();

      // PBMC 데이터셋 검색
      await datasetsPage.searchDataset('pbmc_light_1000');
      await datasetsPage.verifyDatasetVisible('pbmc_light_1000.h5ad');

      // 데이터셋 다운로드
      const download = await datasetsPage.downloadDataset(
        'pbmc_light_1000.h5ad'
      );

      // 다운로드 성공 확인
      await datasetsPage.verifyDownload(download, 'pbmc_light_1000.h5ad');

      console.log('✓ 데이터셋 다운로드 성공');
    });

    // ============================================
    // 단계 2: 고유 이름으로 테스트 파일 업로드
    // ============================================
    await test.step('H5AD 파일 업로드', async () => {
      const filesPage = new FilesPage(page);

      // Files 페이지로 이동
      await goToFiles(page);
      await filesPage.verifyPageLoaded();

      // 'data' 폴더에 있는지 확인
      const currentFolder = await filesPage.getCurrentFolder();
      expect(currentFolder).toBe('data');

      // 고유 파일명 생성 및 업로드
      const uniqueFileName = generateUniqueFileName('test_data.h5ad');
      const { uploadedFileName } = await filesPage.uploadFile('test_data.h5ad', {
        targetFileName: uniqueFileName,
      });
      await filesPage.waitForUploadComplete();

      // 파일 업로드 확인
      await filesPage.verifyFileExists(uploadedFileName);
      uploadedFiles.push(uploadedFileName); // 정리를 위해 추적

      console.log(`✓ H5AD 파일 업로드 성공: ${uploadedFileName}`);
    });

    await test.step('CSV 파일 업로드', async () => {
      const filesPage = new FilesPage(page);

      // 고유 파일명 생성 및 업로드
      const uniqueFileName = generateUniqueFileName('test_sample.csv');
      const { uploadedFileName } = await filesPage.uploadFile('test_sample.csv', {
        targetFileName: uniqueFileName,
      });
      await filesPage.waitForUploadComplete();

      // 파일 업로드 확인
      await filesPage.verifyFileExists(uploadedFileName);
      uploadedFiles.push(uploadedFileName); // 정리를 위해 추적

      console.log(`✓ CSV 파일 업로드 성공: ${uploadedFileName}`);
    });

    await test.step('TXT 파일 업로드', async () => {
      const filesPage = new FilesPage(page);

      // 고유 파일명 생성 및 업로드
      const uniqueFileName = generateUniqueFileName('test_genes.txt');
      const { uploadedFileName } = await filesPage.uploadFile('test_genes.txt', {
        targetFileName: uniqueFileName,
      });
      await filesPage.waitForUploadComplete();

      // 파일 업로드 확인
      await filesPage.verifyFileExists(uploadedFileName);
      uploadedFiles.push(uploadedFileName); // 정리를 위해 추적

      console.log(`✓ TXT 파일 업로드 성공: ${uploadedFileName}`);
    });

    // ============================================
    // 단계 3: 파일 목록 확인
    // ============================================
    await test.step('파일 목록에서 업로드된 모든 파일 확인', async () => {
      const filesPage = new FilesPage(page);

      // 전체 파일 목록 조회
      const fileList = await filesPage.getFileList();
      console.log('현재 파일 목록:', fileList);

      // 최소 파일 수 확인
      const fileCount = await filesPage.getFileCount();
      expect(fileCount).toBeGreaterThanOrEqual(3);

      // 업로드된 각 파일 존재 확인
      for (const fileName of uploadedFiles) {
        const isPresent = await filesPage.isFilePresent(fileName);
        expect(isPresent).toBe(true);
      }

      console.log('✓ 파일 목록에서 모든 파일 확인 완료');
    });

    // ============================================
    // 단계 4: TENET 템플릿으로 워크플로우 생성
    // ============================================
    await test.step('TENET 템플릿으로 워크플로우 프로젝트 생성', async () => {
      const projectsPage = new ProjectsPage(page);

      // Projects 페이지로 이동
      await goToProjects(page);
      await projectsPage.verifyPageLoaded();

      // New Workflow 클릭하여 플러그인 선택 모달 열기
      await projectsPage.clickNewWorkflow();

      // TENET 플러그인 사용 가능 확인
      await projectsPage.verifyPluginAvailable('TENET');

      // 디버깅을 위해 사용 가능한 모든 플러그인 목록 조회
      const availablePlugins = await projectsPage.getAvailablePlugins();
      console.log('사용 가능한 플러그인 템플릿:', availablePlugins);

      // TENET 템플릿 선택
      await projectsPage.selectPluginTemplate('TENET');

      // 워크플로우 페이지로 리다이렉트 확인
      await expect(page).toHaveURL(/.*\/workflow.*/);

      console.log('✓ TENET 워크플로우 생성 성공');
    });
  });

  /**
   * 추가 테스트: 파일 작업 검증
   */
  test('파일 업로드 및 삭제가 정상적으로 동작해야 함', async ({ page }) => {
    // 사전 정리: 이전 테스트 파일 제거
    await cleanupTestFiles(page);

    const filesPage = new FilesPage(page);
    let uploadedFileName;

    await test.step('Files 페이지로 이동', async () => {
      await goToFiles(page);
      await filesPage.verifyPageLoaded();
    });

    await test.step('테스트 파일 업로드', async () => {
      const initialCount = await filesPage.getFileCount();

      // 고유 파일명 생성 및 업로드
      const uniqueFileName = generateUniqueFileName('test_sample.csv');
      const result = await filesPage.uploadFile('test_sample.csv', {
        targetFileName: uniqueFileName,
      });
      uploadedFileName = result.uploadedFileName;
      await filesPage.waitForUploadComplete();

      const newCount = await filesPage.getFileCount();
      expect(newCount).toBe(initialCount + 1);

      console.log(`✓ 파일 업로드 성공: ${uploadedFileName}`);
    });

    await test.step('업로드된 파일 삭제', async () => {
      await filesPage.verifyFileExists(uploadedFileName);
      await filesPage.deleteFile(uploadedFileName);
      await filesPage.verifyFileNotExists(uploadedFileName);

      console.log(`✓ ${uploadedFileName} 파일 삭제 성공`);
    });
  });

  /**
   * 추가 테스트: 데이터셋 검색 기능 검증
   */
  test('데이터셋 검색 및 필터링이 정상적으로 동작해야 함', async ({ page }) => {
    const datasetsPage = new DatasetsPage(page);

    await test.step('Datasets 페이지로 이동', async () => {
      await goToDatasets(page);
      await datasetsPage.verifyPageLoaded();
    });

    await test.step('PBMC 데이터셋 검색', async () => {
      await datasetsPage.searchDataset('pbmc');

      const visibleDatasets = await datasetsPage.getVisibleDatasets();
      console.log('필터링된 데이터셋:', visibleDatasets);

      // PBMC 데이터셋이 결과에 포함되어 있는지 확인
      const hasPBMC = visibleDatasets.some((title) =>
        title.toLowerCase().includes('pbmc')
      );
      expect(hasPBMC).toBe(true);
    });

    await test.step('검색 초기화 후 모든 데이터셋 표시 확인', async () => {
      await datasetsPage.searchDataset('');

      const allDatasets = await datasetsPage.getVisibleDatasets();
      expect(allDatasets.length).toBeGreaterThan(0);
    });
  });

  /**
   * 추가 테스트: 플러그인 템플릿 선택 검증
   */
  test('플러그인 템플릿이 표시되고 선택 가능해야 함', async ({ page }) => {
    const projectsPage = new ProjectsPage(page);

    await test.step('Projects 페이지로 이동', async () => {
      await goToProjects(page);
      await projectsPage.verifyPageLoaded();
    });

    await test.step('플러그인 선택 모달 열기', async () => {
      await projectsPage.clickNewWorkflow();

      await expect
        .poll(async () => {
          const plugins = await projectsPage.getAvailablePlugins();
          console.log('사용 가능한 플러그인:', plugins);
          return plugins.some((p) => p.name && p.name.includes('TENET'));
        }, {
          message: '플러그인 목록에 TENET이 나타날 때까지 대기',
          timeout: 20000,
        })
        .toBe(true);
    });

    await test.step('기본 템플릿 선택', async () => {
      await projectsPage.selectDefaultTemplate();
      await expect(page).toHaveURL(/.*\/workflow.*/);
    });
  });
});
