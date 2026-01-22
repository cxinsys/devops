// frontend/tests/e2e/workflows/support/workflow-setup.js

import { ProjectsPage } from '../../pages/ProjectsPage.js';
import { WorkflowPage } from '../../pages/WorkflowPage.js';
import { FilesPage } from '../../pages/FilesPage.js';
import { InputFileModal } from '../../pages/modals/InputFileModal.js';
import { AlgorithmModal } from '../../pages/modals/AlgorithmModal.js';
import { DataTableModal } from '../../pages/modals/DataTableModal.js';
import { ScatterPlotModal } from '../../pages/modals/ScatterPlotModal.js';
import { LogsModal } from '../../pages/modals/LogsModal.js';
import { DagModal } from '../../pages/modals/DagModal.js';
import { CompileCheckModal } from '../../pages/modals/CompileCheckModal.js';
import { ResultFilesModal } from '../../pages/modals/ResultFilesModal.js';
import { VisualizationModal } from '../../pages/modals/VisualizationModal.js';
import { generateUniqueFileName, generateUniqueWorkflowTitle } from './workflow-constants.js';

/**
 * 워크플로우 테스트를 위한 모든 페이지 객체 초기화
 * @param {import('@playwright/test').Page} page - Playwright 페이지 객체
 * @returns {Object} 초기화된 모든 페이지 객체를 포함하는 객체
 */
export function setupPageObjects(page) {
  return {
    projectsPage: new ProjectsPage(page),
    workflowPage: new WorkflowPage(page),
    filesPage: new FilesPage(page),
    inputFileModal: new InputFileModal(page),
    algorithmModal: new AlgorithmModal(page),
    dataTableModal: new DataTableModal(page),
    scatterPlotModal: new ScatterPlotModal(page),
    logsModal: new LogsModal(page),
    dagModal: new DagModal(page),
    compileCheckModal: new CompileCheckModal(page),
    resultFilesModal: new ResultFilesModal(page),
    visualizationModal: new VisualizationModal(page),
  };
}

/**
 * 테스트 파일 설정: 테스트 격리를 위해 항상 고유 이름으로 파일 업로드
 * @param {FilesPage} filesPage - FilesPage 인스턴스
 * @param {Object} testWorkflow - 테스트 워크플로우 설정
 * @param {Array<string>} uploadedFiles - 정리를 위해 업로드된 파일을 추적하는 배열
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.uploadSecondFile - 두 번째 파일 업로드 여부 (파일 변경 테스트용)
 * @returns {Promise<Object>} { uploadedFileName, secondFileName }과 함께 업로드된 파일명 반환
 */
export async function setupTestFiles(filesPage, testWorkflow, uploadedFiles, options = {}) {
  await filesPage.goto();
  await filesPage.verifyPageLoaded();

  // 페이지 안정화 대기
  await filesPage.page.waitForTimeout(1000);

  // 참고: 폴더 선택은 파일 업로드에 필요하지 않아 제거됨
  // 폴더를 먼저 명시적으로 선택하지 않아도 파일을 직접 업로드할 수 있음

  // 테스트 격리를 위해 항상 고유 파일명으로 업로드
  const uniqueFileName = generateUniqueFileName(testWorkflow.expectedFile);
  console.log(`📤 고유 이름으로 테스트 파일 업로드: ${uniqueFileName}`);

  const { uploadedFileName } = await filesPage.uploadFile('test_data.h5ad', {
    targetFileName: uniqueFileName,
  });
  uploadedFiles.push(uploadedFileName);
  await filesPage.waitForUploadComplete();

  // 확장된 타임아웃(15초)으로 파일이 테이블에 나타나는지 확인
  await filesPage.verifyFileExists(uploadedFileName, 15000);
  console.log(`✅ 테스트 파일 업로드 완료: ${uploadedFileName}`);

  let secondFileName = null;

  // 요청된 경우 두 번째 파일 업로드 (파일 변경 테스트용)
  if (options.uploadSecondFile) {
    const uniqueSecondFileName = generateUniqueFileName('demo.h5ad');
    console.log(`📤 고유 이름으로 두 번째 테스트 파일 업로드: ${uniqueSecondFileName}`);

    const { uploadedFileName: secondFile } = await filesPage.uploadFile('demo.h5ad', {
      targetFileName: uniqueSecondFileName,
      timeout: 60000,
    });
    uploadedFiles.push(secondFile);
    await filesPage.waitForUploadComplete();

    // 확장된 타임아웃(15초)으로 두 번째 파일이 테이블에 나타나는지 확인
    await filesPage.verifyFileExists(secondFile, 15000);
    console.log(`✅ 두 번째 테스트 파일 업로드 완료: ${secondFile}`);
    secondFileName = secondFile;
  }

  return { uploadedFileName, secondFileName };
}

/**
 * 업로드된 테스트 파일 정리 - 배열이 비어있어도 항상 정리 시도
 * @param {FilesPage} filesPage - FilesPage 인스턴스
 * @param {Array<string>} uploadedFiles - 삭제할 업로드된 파일 배열
 * @param {string} folder - 정리 전 선택할 폴더 이름 (기본값: 'data')
 * @returns {Promise<void>}
 */
export async function cleanupTestFiles(filesPage, uploadedFiles, folder = 'data') {
  if (uploadedFiles.length === 0) {
    console.log('🧹 정리할 파일 없음 (uploadedFiles 배열이 비어있음)');
    return;
  }

  console.log(`🧹 [정리] ${new Date().toISOString()}에 파일 정리 시작`);
  console.log(`📋 정리할 파일 수: ${uploadedFiles.length}`);
  uploadedFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });

  await filesPage.goto();
  await filesPage.verifyPageLoaded();

  // 페이지 이동 후 안정화 대기
  await filesPage.page.waitForTimeout(1000);

  // 현재 폴더가 올바른지 확인
  let currentFolder = '';
  try {
    currentFolder = await filesPage.getCurrentFolder();
    console.log(`현재 폴더: ${currentFolder}`);
  } catch (error) {
    console.log(`⚠️ 현재 폴더를 가져올 수 없음:`, error.message);
  }

  // 정리 전 폴더 선택 (이미 올바른 폴더에 있으면 건너뛰기, 재시도 포함)
  if (currentFolder !== folder) {
    let folderSelected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await filesPage.selectFolder(folder);
        console.log(`✓ 폴더 선택 완료: ${folder} (시도 ${attempt})`);
        folderSelected = true;
        break;
      } catch (error) {
        if (attempt === 3) {
          console.warn(`⚠️ ${attempt}번 시도 후에도 폴더 "${folder}" 선택 실패:`, error.message);
          console.warn(`⚠️ 폴더를 선택할 수 없어 파일 정리 건너뜀`);
          uploadedFiles.length = 0;
          return; // 폴더 선택 실패 시 조기 반환
        }
        console.log(`⚠️ 폴더 선택 시도 ${attempt} 실패, 재시도 중...`);
        await filesPage.page.waitForTimeout(1000);
      }
    }
  } else {
    console.log(`✓ 이미 폴더에 있음: ${folder}`);
  }

  let successCount = 0;
  let failCount = 0;

  for (const fileName of uploadedFiles) {
    const startTime = Date.now();
    try {
      // 파일 삭제
      await filesPage.deleteFile(fileName);

      // 삭제 확인
      await filesPage.verifyFileNotExists(fileName);

      const elapsed = Date.now() - startTime;
      console.log(`✅ [${elapsed}ms] 삭제 및 확인 완료: ${fileName}`);
      successCount++;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`❌ 삭제 실패: ${fileName}`);
      console.log(`   오류: ${error.message}`);
      console.log(`   타입: ${error.constructor.name}`);
      console.log(`   경과 시간: ${elapsed}ms`);
      failCount++;
    }
  }

  console.log(`🧹 [정리] 파일 정리 완료: ${successCount}개 성공, ${failCount}개 실패 (총 ${uploadedFiles.length}개)`);

  // 삭제 실패 건이 있으면 경고
  if (failCount > 0) {
    console.warn(`⚠️ 경고: ${failCount}개 파일 정리 실패. 테스트 간섭이 발생할 수 있음.`);
  }

  // 다음 테스트를 위해 배열 초기화
  uploadedFiles.length = 0;
}

/**
 * 파일 변경 테스트를 위한 테스트 파일 설정 - 고유 파일명으로 업로드
 * @param {FilesPage} filesPage - FilesPage 인스턴스
 * @param {Object} testWorkflow - 테스트 워크플로우 설정
 * @param {Array<string>} uploadedFiles - 정리를 위해 업로드된 파일을 추적하는 배열
 * @returns {Promise<string>} 업로드된 파일명 반환
 */
export async function setupFileChangeTest(filesPage, testWorkflow, uploadedFiles) {
  await filesPage.goto();

  // 참고: 폴더 선택은 파일 업로드에 필요하지 않아 제거됨
  // 폴더를 먼저 명시적으로 선택하지 않아도 파일을 직접 업로드할 수 있음

  // 테스트 격리를 위해 항상 고유 파일명 사용
  const uniqueFileName = generateUniqueFileName(testWorkflow.expectedFile);
  console.log(`📤 파일 변경 테스트용 고유 이름으로 파일 업로드: ${uniqueFileName}`);

  const { uploadedFileName } = await filesPage.uploadFile('test_data.h5ad', {
    targetFileName: uniqueFileName,
    timeout: 60000,
  });

  // 정리를 위해 업로드된 파일 추적
  uploadedFiles.push(uploadedFileName);

  await filesPage.waitForUploadComplete();

  // 확장된 타임아웃(15초)으로 파일이 테이블에 나타나는지 확인
  await filesPage.verifyFileExists(uploadedFileName, 15000);
  console.log(`✅ 파일 변경 테스트 파일 업로드 완료: ${uploadedFileName}`);

  return uploadedFileName;
}

/**
 * 테스트 격리를 위해 고유 제목으로 워크플로우 생성
 * @param {ProjectsPage} projectsPage - ProjectsPage 인스턴스
 * @param {WorkflowPage} workflowPage - WorkflowPage 인스턴스
 * @param {Object} testWorkflow - 테스트 워크플로우 설정
 * @param {Array<string>} createdWorkflows - 정리를 위해 생성된 워크플로우를 추적하는 배열
 * @returns {Promise<string>} 고유 워크플로우 제목 반환
 */
export async function createWorkflowWithUniqueTitle(projectsPage, workflowPage, testWorkflow, createdWorkflows) {
  // 1. 템플릿에서 워크플로우 생성 ("Untitled"로 시작하여 자동 저장됨)
  await projectsPage.clickNewWorkflow();
  await projectsPage.selectPluginTemplate(testWorkflow.name);
  await workflowPage.verifyPageLoaded();

  // 2. 고유 제목 생성
  const uniqueTitle = generateUniqueWorkflowTitle(testWorkflow.name);

  // 3. 워크플로우 제목 업데이트
  await workflowPage.updateWorkflowTitle(uniqueTitle);

  // 4. 워크플로우 저장 (제목이 데이터베이스에 영속화되도록 보장)
  await workflowPage.saveWorkflow();
  await workflowPage.closeMessage().catch(() => {}); // 성공 메시지 닫기

  // 5. 정리를 위해 추적
  createdWorkflows.push(uniqueTitle);

  console.log(`✅ 고유 제목으로 워크플로우 생성 완료: ${uniqueTitle}`);

  return uniqueTitle;
}

/**
 * 생성된 워크플로우 정리 - Projects 페이지를 통해 데이터베이스에서 삭제
 * @param {ProjectsPage} projectsPage - ProjectsPage 인스턴스
 * @param {Array<string>} createdWorkflows - 삭제할 생성된 워크플로우 제목 배열
 * @returns {Promise<void>}
 */
export async function cleanupWorkflows(projectsPage, createdWorkflows) {
  if (createdWorkflows.length === 0) {
    console.log('🧹 정리할 워크플로우 없음 (createdWorkflows 배열이 비어있음)');
    return;
  }

  console.log(`🧹 [정리] ${new Date().toISOString()}에 워크플로우 정리 시작`);
  console.log(`📋 정리할 워크플로우 수: ${createdWorkflows.length}`);
  createdWorkflows.forEach((title, index) => {
    console.log(`   ${index + 1}. ${title}`);
  });

  // 삭제를 위해 Projects 페이지로 이동
  await projectsPage.goto();
  await projectsPage.verifyPageLoaded();

  let successCount = 0;
  let failCount = 0;

  for (const workflowTitle of createdWorkflows) {
    const startTime = Date.now();
    try {
      // 워크플로우 삭제
      await projectsPage.deleteWorkflow(workflowTitle);

      // 삭제 확인
      await projectsPage.verifyWorkflowNotExists(workflowTitle);

      const elapsed = Date.now() - startTime;
      console.log(`✅ [${elapsed}ms] 삭제 및 확인 완료: ${workflowTitle}`);
      successCount++;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`❌ 삭제 실패: ${workflowTitle}`);
      console.log(`   오류: ${error.message}`);
      console.log(`   타입: ${error.constructor.name}`);
      console.log(`   경과 시간: ${elapsed}ms`);
      failCount++;
    }
  }

  console.log(`🧹 [정리] 워크플로우 정리 완료: ${successCount}개 성공, ${failCount}개 실패 (총 ${createdWorkflows.length}개)`);

  // 삭제 실패 건이 있으면 경고
  if (failCount > 0) {
    console.warn(`⚠️ 경고: ${failCount}개 워크플로우 정리 실패. 테스트 간섭이 발생할 수 있음.`);
  }

  // 다음 테스트를 위해 배열 초기화
  createdWorkflows.length = 0;
}
