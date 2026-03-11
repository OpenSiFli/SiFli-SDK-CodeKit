import { ProjectCreationService } from '../services/projectCreationService';

export class ProjectCommands {
  private static instance: ProjectCommands;
  private projectCreationService: ProjectCreationService;

  private constructor() {
    this.projectCreationService = ProjectCreationService.getInstance();
  }

  public static getInstance(): ProjectCommands {
    if (!ProjectCommands.instance) {
      ProjectCommands.instance = new ProjectCommands();
    }
    return ProjectCommands.instance;
  }

  public async createNewSiFliProject(): Promise<void> {
    await this.projectCreationService.createNewProjectFromSdkExamples();
  }
}
